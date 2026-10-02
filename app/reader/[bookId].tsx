import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '../../components/BottomSheet';
import { ChapterRow } from '../../components/ChapterRow';
import { ReaderToolbar, ReaderTool } from '../../components/ReaderToolbar';
import { comments, getBook as getDemoBook } from '../../data/books';
import { getChapterContent } from '../../data/readerContent';
import { usePersistentState } from '../../hooks/usePersistentState';
import { defaultReaderSettings } from '../../services/storage';
import { getBookById } from '../../services/books';
import { getChaptersByBook } from '../../services/chapters';
import { getBookmarks, getReadingProgress, saveReadingProgress, toggleBookmark as persistBookmark } from '../../services/library';
import { useAuth } from '../../contexts/AuthContext';
import { SLEEP_TIMERS, SleepTimer, TTS_SPEEDS, TTS_VOICES, TtsVoice } from '../../services/tts';
import { Book, Chapter, ReaderFont, ReaderMode, ReaderSettings, ReaderSpacing, ReaderTheme } from '../../types';

type Sheet = ReaderTool | null;
type Bookmark = { chapter: number; progress: number; updatedAt: string };

const themes: Record<ReaderTheme, { bg: string; text: string; muted: string; bar: string }> = {
  white: { bg: '#FFFFFF', text: '#282326', muted: '#837A7E', bar: '#FFFFFF' },
  paper: { bg: '#F8F2E9', text: '#302821', muted: '#84766B', bar: '#FFFDFC' },
  night: { bg: '#27282C', text: '#DAD5CD', muted: '#A9A49D', bar: '#211F20' },
  amoled: { bg: '#000000', text: '#D1CDCA', muted: '#8D8986', bar: '#080808' }
};

export default function ReaderScreen() {
  const params = useLocalSearchParams<{ bookId: string; chapter?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [book, setBook] = useState<Book>(() => getDemoBook(params.bookId));
  const initialChapter = Math.min(book.totalChapters, Math.max(1, Number(params.chapter) || 1));
  const [chapterNumber, setChapterNumber] = useState(initialChapter);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [settings, setSettings] = usePersistentState<ReaderSettings>('reader:settings', defaultReaderSettings);
  const [bookmarked, setBookmarked] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [progressReady, setProgressReady] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [aiResult, setAiResult] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const scrollPosition = useRef(0);

  const chapter = book.chapters.find((item) => item.number === chapterNumber) ?? book.chapters[chapterNumber - 1] ?? getDemoBook(params.bookId).chapters[0];
  const content = useMemo(() => chapter.content ? chapter.content.split(/\n\s*\n/).filter(Boolean) : getChapterContent(chapterNumber), [chapter.content, chapterNumber]);
  const bookmark: Bookmark | null = bookmarked ? { chapter: chapterNumber, progress: readingProgress, updatedAt: new Date().toISOString() } : null;
  const palette = themes[settings.theme];
  const dark = settings.theme === 'night' || settings.theme === 'amoled';
  const lineHeight = settings.fontSize * ({ compact: 1.5, normal: 1.72, relaxed: 1.95 }[settings.spacing]);
  const fontFamily = settings.font === 'serif' ? 'Georgia' : settings.font === 'sans' ? 'Arial' : undefined;
  const filteredChapters = useMemo(() => {
    const value = chapterSearch.trim().toLowerCase().replace('chương', '').trim();
    if (!value) return book.chapters.slice(Math.max(0, chapterNumber - 5), Math.min(book.totalChapters, chapterNumber + 5));
    return book.chapters.filter((item) => String(item.number).includes(value) || item.title.toLowerCase().includes(value)).slice(0, 30);
  }, [book.chapters, book.totalChapters, chapterNumber, chapterSearch]);

  useEffect(() => {
    let active = true; setProgressReady(false);
    const load = async () => {
      try {
        const result = await getBookById(params.bookId); if (!result.data || !active) return;
        const chapters = await getChaptersByBook(result.data.id); if (!active) return;
        const hydrated = { ...result.data, chapters: chapters.data, totalChapters: chapters.data.length || result.data.totalChapters }; setBook(hydrated);
        const saved = await getReadingProgress(hydrated.id, user?.id);
        const targetChapter = Number(params.chapter) || saved?.chapterNumber || 1;
        setChapterNumber(Math.min(hydrated.totalChapters || 1, Math.max(1, targetChapter)));
        setReadingProgress(saved?.chapterNumber === targetChapter ? saved.progressPercent : 0);
        scrollPosition.current = saved?.chapterNumber === targetChapter ? saved.scrollPosition : 0;
        const marks = await getBookmarks(hydrated.id, user?.id); if (!active) return;
        setBookmarked(marks.some((item) => item.chapterNumber === targetChapter)); setProgressReady(true);
        if (scrollPosition.current > 0) setTimeout(() => scrollRef.current?.scrollTo({ y: scrollPosition.current, animated: false }), 80);
      } catch { if (active) setProgressReady(true); }
    };
    load(); return () => { active = false; };
  }, [params.bookId, params.chapter, user?.id]);

  useEffect(() => {
    if (!progressReady) return;
    const timer = setTimeout(() => {
      saveReadingProgress({ bookId: book.id, chapterId: chapter.id, chapterNumber, progressPercent: readingProgress, scrollPosition: scrollPosition.current }, user?.id).catch(() => undefined);
    }, 1200);
    return () => clearTimeout(timer);
  }, [book.id, chapter.id, chapterNumber, progressReady, readingProgress, user?.id]);

  const goChapter = (number: number) => {
    const next = Math.min(book.totalChapters, Math.max(1, number));
    setChapterNumber(next);
    setSheet(null);
    setChapterSearch('');
    setReadingProgress(0);
    setBookmarked(false);
    scrollPosition.current = 0;
    router.setParams({ chapter: String(next) });
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollPosition.current = contentOffset.y;
    const max = contentSize.height - layoutMeasurement.height;
    setReadingProgress(max > 0 ? Math.min(100, Math.round(contentOffset.y / max * 100)) : 100);
  };

  const toggleBookmark = async () => {
    const previous = bookmarked; setBookmarked(!previous);
    try { const next = await persistBookmark({ bookId: book.id, chapterId: chapter.id, chapterNumber, position: readingProgress, note: null }, user?.id); setBookmarked(next); }
    catch { setBookmarked(previous); }
  };

  const chooseTool = (tool: ReaderTool) => {
    setSheet(tool);
    setControlsVisible(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={120}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.readingPage, { paddingHorizontal: settings.padding, paddingTop: insets.top + 72, paddingBottom: insets.bottom + 105 }]}
        style={{ backgroundColor: palette.bg }}
      >
        <Pressable onPress={() => setControlsVisible((value) => !value)}>
          {settings.mode === 'page' ? <View style={[styles.preview, dark && styles.previewDark]}><Ionicons name="albums-outline" size={15} color="#8F1D3F" /><Text style={[styles.previewText, dark && styles.previewTextDark]}>Xem trước chế độ lật trang · Vuốt dọc vẫn khả dụng</Text></View> : null}
          <Text style={[styles.bookKicker, { color: palette.muted }]}>{book.title.toUpperCase()}</Text>
          <Text style={[styles.chapterNumber, { color: palette.text }]}>Chương {chapterNumber}</Text>
          <Text style={[styles.chapterTitle, { color: palette.text }]}>{chapter.title}</Text>
          <View style={[styles.rule, { backgroundColor: palette.muted }]} />
          {content.map((paragraph, index) => (
            <Text key={`${chapterNumber}-${index}`} style={[styles.paragraph, { color: palette.text, fontSize: settings.fontSize, lineHeight, fontFamily }]}>{paragraph}</Text>
          ))}
          <Text style={[styles.endMark, { color: palette.muted }]}>— Hết chương {chapterNumber} —</Text>
        </Pressable>

        <View style={[styles.chapterNav, { borderColor: dark ? '#4C494B' : '#D9CCC4' }]}>
          <Pressable disabled={chapterNumber === 1} onPress={() => goChapter(chapterNumber - 1)} style={[styles.navButton, chapterNumber === 1 && styles.disabled]}><Ionicons name="chevron-back" size={16} color={palette.text} /><Text style={[styles.navText, { color: palette.text }]}>Chương trước</Text></Pressable>
          <Pressable onPress={() => setSheet('chapters')} style={styles.navCenter}><Ionicons name="list" size={19} color="#9C3153" /><Text style={styles.navCenterText}>Danh sách</Text></Pressable>
          <Pressable disabled={chapterNumber === book.totalChapters} onPress={() => goChapter(chapterNumber + 1)} style={[styles.navButton, styles.navRight, chapterNumber === book.totalChapters && styles.disabled]}><Text style={[styles.navText, { color: palette.text }]}>Chương sau</Text><Ionicons name="chevron-forward" size={16} color={palette.text} /></Pressable>
        </View>
        <View style={styles.discussion}>
          <View style={styles.discussionTitle}><Text style={[styles.discussionHeading, { color: palette.text }]}>Thảo luận chương</Text><Text style={{ color: palette.muted, fontSize: 11 }}>{comments.length} bình luận</Text></View>
          {comments.slice(0, 2).map((item) => <View key={item.id} style={styles.miniComment}><View style={styles.miniAvatar}><Text style={styles.miniAvatarText}>{item.avatar}</Text></View><View style={{ flex: 1 }}><Text style={[styles.miniName, { color: palette.text }]}>{item.name}</Text><Text style={[styles.miniBody, { color: palette.muted }]}>{item.body}</Text></View></View>)}
        </View>
      </ScrollView>

      {controlsVisible ? (
        <>
          <View style={[styles.topbar, { paddingTop: insets.top, height: 57 + insets.top, backgroundColor: palette.bar, borderBottomColor: dark ? '#3F3B3D' : '#DFD2CB' }]}>
            <Pressable style={styles.topIcon} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={palette.text} /></Pressable>
            <View style={styles.topCopy}><Text numberOfLines={1} style={[styles.topTitle, { color: palette.text }]}>{book.title}</Text><Text style={[styles.topSubtitle, { color: palette.muted }]}>Chương {chapterNumber} · {readingProgress}%</Text></View>
            <Pressable style={styles.topIcon} onPress={toggleBookmark}><Ionicons name={bookmark?.chapter === chapterNumber ? 'bookmark' : 'bookmark-outline'} size={22} color={bookmark?.chapter === chapterNumber ? '#A52C52' : palette.text} /></Pressable>
          </View>
          <View style={styles.toolbar}><ReaderToolbar onSelect={chooseTool} dark={dark} /></View>
        </>
      ) : null}

      <ChapterSheet visible={sheet === 'chapters'} onClose={() => setSheet(null)} chapters={filteredChapters} query={chapterSearch} onQuery={setChapterSearch} onSelect={goChapter} current={chapterNumber} />
      <SettingsSheet visible={sheet === 'settings'} onClose={() => setSheet(null)} settings={settings} onChange={setSettings} />
      <AudioSheet visible={sheet === 'audio'} onClose={() => setSheet(null)} chapterTitle={`Chương ${chapterNumber} · ${chapter.title}`} onPrevious={() => goChapter(chapterNumber - 1)} onNext={() => goChapter(chapterNumber + 1)} canPrevious={chapterNumber > 1} canNext={chapterNumber < book.totalChapters} />
      <AiSheet visible={sheet === 'ai'} onClose={() => setSheet(null)} onOpen={(path) => router.push({ pathname: path, params: { bookId: book.id, chapter: chapterNumber } })} result={aiResult} onResult={setAiResult} />
      <MoreSheet visible={sheet === 'more'} onClose={() => setSheet(null)} bookmark={bookmark} chapter={chapterNumber} onBookmark={toggleBookmark} onComments={() => { setSheet(null); requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })); }} />
    </View>
  );
}

function ChapterSheet({ visible, onClose, chapters, query, onQuery, onSelect, current }: { visible: boolean; onClose: () => void; chapters: Chapter[]; query: string; onQuery: (value: string) => void; onSelect: (number: number) => void; current: number }) {
  return <BottomSheet visible={visible} title="Danh sách chương" onClose={onClose} scroll tall>
    <View style={sheetStyles.search}><Ionicons name="search" size={18} color="#80747A" /><TextInput style={sheetStyles.input} value={query} onChangeText={onQuery} placeholder="Tìm chương…" placeholderTextColor="#9C9296" /></View>
    {!query ? <Text style={sheetStyles.hint}>Đang đọc chương {current} · Các chương gần đây</Text> : null}
    {chapters.map((item) => <ChapterRow key={item.number} chapter={item} onPress={() => onSelect(item.number)} />)}
  </BottomSheet>;
}

function SettingsSheet({ visible, onClose, settings, onChange }: { visible: boolean; onClose: () => void; settings: ReaderSettings; onChange: (value: ReaderSettings) => void }) {
  const update = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => onChange({ ...settings, [key]: value });
  return <BottomSheet visible={visible} title="Giao diện đọc" onClose={onClose} scroll>
    <SettingLabel title="Cỡ chữ" value={`${settings.fontSize}px`} />
    <View style={sheetStyles.adjust}><Pressable style={sheetStyles.adjustButton} onPress={() => update('fontSize', Math.max(14, settings.fontSize - 1))}><Text style={sheetStyles.smallA}>A−</Text></Pressable><View style={sheetStyles.adjustTrack}><View style={[sheetStyles.adjustFill, { width: `${(settings.fontSize - 14) / 12 * 100}%` }]} /></View><Pressable style={sheetStyles.adjustButton} onPress={() => update('fontSize', Math.min(26, settings.fontSize + 1))}><Text style={sheetStyles.bigA}>A+</Text></Pressable></View>
    <SettingLabel title="Phông chữ" />
    <Segment options={[['default', 'Mặc định'], ['serif', 'Serif'], ['sans', 'Sans']]} value={settings.font} onChange={(value) => update('font', value as ReaderFont)} />
    <SettingLabel title="Giãn dòng" />
    <Segment options={[['compact', 'Gọn'], ['normal', 'Thường'], ['relaxed', 'Thoáng']]} value={settings.spacing} onChange={(value) => update('spacing', value as ReaderSpacing)} />
    <SettingLabel title="Nền đọc" />
    <View style={sheetStyles.themeRow}>{([['white', 'Trắng', '#FFFFFF'], ['paper', 'Giấy', '#F8F2E9'], ['night', 'Đêm', '#27282C'], ['amoled', 'AMOLED', '#000000']] as const).map(([id, label, color]) => <Pressable key={id} style={sheetStyles.themeOption} onPress={() => update('theme', id as ReaderTheme)}><View style={[sheetStyles.themeCircle, { backgroundColor: color }, settings.theme === id && sheetStyles.themeActive]}>{settings.theme === id ? <Ionicons name="checkmark" size={16} color={id === 'white' || id === 'paper' ? '#8F1D3F' : '#FFFFFF'} /> : null}</View><Text style={sheetStyles.themeLabel}>{label}</Text></Pressable>)}</View>
    <SettingLabel title="Lề trang" value={`${settings.padding}px`} />
    <View style={sheetStyles.paddingRow}><Pressable onPress={() => update('padding', Math.max(14, settings.padding - 4))}><Ionicons name="remove-circle-outline" size={28} color="#8F1D3F" /></Pressable><View style={sheetStyles.paddingDemo}><View style={{ width: `${Math.max(35, 92 - settings.padding)}%`, height: 3, backgroundColor: '#8F1D3F' }} /><View style={{ width: `${Math.max(28, 80 - settings.padding)}%`, height: 3, backgroundColor: '#CDBDC2' }} /></View><Pressable onPress={() => update('padding', Math.min(42, settings.padding + 4))}><Ionicons name="add-circle-outline" size={28} color="#8F1D3F" /></Pressable></View>
    <SettingLabel title="Chế độ đọc" />
    <Segment options={[['scroll', 'Cuộn dọc'], ['page', 'Lật trang · Xem trước']]} value={settings.mode} onChange={(value) => update('mode', value as ReaderMode)} />
  </BottomSheet>;
}

function SettingLabel({ title, value }: { title: string; value?: string }) { return <View style={sheetStyles.labelRow}><Text style={sheetStyles.label}>{title}</Text>{value ? <Text style={sheetStyles.labelValue}>{value}</Text> : null}</View>; }

function Segment({ options, value, onChange }: { options: readonly (readonly [string, string])[]; value: string; onChange: (value: string) => void }) {
  return <View style={sheetStyles.segment}>{options.map(([id, label]) => <Pressable key={id} onPress={() => onChange(id)} style={[sheetStyles.segmentItem, value === id && sheetStyles.segmentActive]}><Text style={[sheetStyles.segmentText, value === id && sheetStyles.segmentTextActive]}>{label}</Text></Pressable>)}</View>;
}

function AudioSheet({ visible, onClose, chapterTitle, onPrevious, onNext, canPrevious, canNext }: { visible: boolean; onClose: () => void; chapterTitle: string; onPrevious: () => void; onNext: () => void; canPrevious: boolean; canNext: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(24);
  const [speed, setSpeed] = useState(1);
  const [voice, setVoice] = useState<TtsVoice>('Nữ');
  const [timer, setTimer] = useState<SleepTimer>('Tắt');
  useEffect(() => {
    if (!playing || !visible) return;
    const interval = setInterval(() => setProgress((value) => value >= 100 ? 0 : value + .35 * speed), 500);
    return () => clearInterval(interval);
  }, [playing, speed, visible]);
  return <BottomSheet visible={visible} title="Nghe chương" onClose={onClose} scroll>
    <View style={audioStyles.art}><Ionicons name="headset" size={35} color="#F4E9E4" /><View style={audioStyles.wave}><View style={audioStyles.waveLine} /><View style={[audioStyles.waveLine, { height: 25 }]} /><View style={[audioStyles.waveLine, { height: 16 }]} /><View style={[audioStyles.waveLine, { height: 28 }]} /><View style={audioStyles.waveLine} /></View></View>
    <Text style={audioStyles.title}>{chapterTitle}</Text><Text style={audioStyles.sub}>Giọng đọc thử nghiệm · CHƯƠNG Audio</Text>
    <Pressable style={audioStyles.track} onPress={() => setProgress((progress + 10) % 100)}><View style={[audioStyles.fill, { width: `${progress}%` }]}><View style={audioStyles.thumb} /></View></Pressable>
    <View style={audioStyles.time}><Text style={audioStyles.timeText}>{Math.floor(progress * .32)}:{String(Math.floor(progress * .47) % 60).padStart(2, '0')}</Text><Text style={audioStyles.timeText}>32:18</Text></View>
    <View style={audioStyles.controls}><Pressable disabled={!canPrevious} onPress={onPrevious} style={!canPrevious && styles.disabled}><Ionicons name="play-skip-back" size={23} color="#55494E" /></Pressable><Pressable onPress={() => setProgress(Math.max(0, progress - 8))}><View><Ionicons name="refresh-outline" size={27} color="#55494E" /><Text style={audioStyles.seconds}>15</Text></View></Pressable><Pressable style={audioStyles.play} onPress={() => setPlaying((value) => !value)}><Ionicons name={playing ? 'pause' : 'play'} size={29} color="#FFFFFF" /></Pressable><Pressable onPress={() => setProgress(Math.min(100, progress + 8))}><View><Ionicons name="refresh-outline" size={27} color="#55494E" style={{ transform: [{ scaleX: -1 }] }} /><Text style={audioStyles.seconds}>15</Text></View></Pressable><Pressable disabled={!canNext} onPress={onNext} style={!canNext && styles.disabled}><Ionicons name="play-skip-forward" size={23} color="#55494E" /></Pressable></View>
    <Text style={audioStyles.optionLabel}>Tốc độ</Text><View style={audioStyles.options}>{TTS_SPEEDS.map((item) => <Pressable key={item} onPress={() => setSpeed(item)} style={[audioStyles.option, speed === item && audioStyles.optionActive]}><Text style={[audioStyles.optionText, speed === item && audioStyles.optionTextActive]}>{item}x</Text></Pressable>)}</View>
    <Text style={audioStyles.optionLabel}>Giọng đọc</Text><Segment options={TTS_VOICES.map((item) => [item, item] as const)} value={voice} onChange={(value) => setVoice(value as TtsVoice)} />
    <Text style={audioStyles.optionLabel}>Hẹn giờ ngủ {timer !== 'Tắt' ? `· ${timer}` : ''}</Text><View style={audioStyles.options}>{SLEEP_TIMERS.map((item) => <Pressable key={item} onPress={() => setTimer(timer === item ? 'Tắt' : item)} style={[audioStyles.timerChoice, timer === item && audioStyles.optionActive]}><Text style={[audioStyles.timerChoiceText, timer === item && audioStyles.optionTextActive]}>{item}</Text></Pressable>)}</View>
  </BottomSheet>;
}

type AiPath = '/ai/convert' | '/ai/recap' | '/ai/chat';
function AiSheet({ visible, onClose, onOpen, result, onResult }: { visible: boolean; onClose: () => void; onOpen: (path: AiPath) => void; result: string; onResult: (value: string) => void }) {
  const options: { icon: keyof typeof Ionicons.glyphMap; label: string; detail: string; action: () => void }[] = [
    { icon: 'sparkles', label: 'Làm mượt đoạn này', detail: 'Câu văn tự nhiên, giữ nguyên ý', action: () => onOpen('/ai/convert') },
    { icon: 'swap-horizontal', label: 'Convert chuẩn', detail: 'Chuẩn hóa câu chữ bản dịch', action: () => onOpen('/ai/convert') },
    { icon: 'flash-outline', label: 'Văn phong hiện đại', detail: 'Diễn đạt gọn và đương đại', action: () => onOpen('/ai/convert') },
    { icon: 'reader-outline', label: 'Tóm tắt đến đây', detail: 'Không tiết lộ chương sau', action: () => onOpen('/ai/recap') },
    { icon: 'chatbubbles-outline', label: 'Hỏi truyện', detail: 'Hỏi về nhân vật và tình tiết', action: () => onOpen('/ai/chat') },
    { icon: 'bulb-outline', label: 'Giải thích đoạn này', detail: 'Làm rõ hàm ý trong đoạn', action: () => onResult('Đoạn này cho thấy Diệp Phàm biết trước nguy hiểm nhưng vẫn chọn đi tiếp. “Cánh cửa” là ẩn dụ cho sự thật về người cha mà anh đã tìm kiếm suốt mười năm.') }
  ];
  return <BottomSheet visible={visible} title="✨ Công cụ AI" onClose={onClose} scroll>
    <Text style={sheetStyles.aiNotice}>AI chỉ dựa trên phần truyện bạn đã đọc. Kết quả ở giai đoạn này là bản minh họa cục bộ.</Text>
    {options.map((item) => <Pressable style={sheetStyles.aiRow} key={item.label} onPress={item.action}><View style={sheetStyles.aiIcon}><Ionicons name={item.icon} size={19} color="#8F1D3F" /></View><View style={{ flex: 1 }}><Text style={sheetStyles.aiTitle}>{item.label}</Text><Text style={sheetStyles.aiDetail}>{item.detail}</Text></View><Ionicons name="chevron-forward" size={17} color="#A2959A" /></Pressable>)}
    {result ? <View style={sheetStyles.aiResult}><Text style={sheetStyles.aiResultTitle}>Giải thích</Text><Text style={sheetStyles.aiResultText}>{result}</Text></View> : null}
  </BottomSheet>;
}

function MoreSheet({ visible, onClose, bookmark, chapter, onBookmark, onComments }: { visible: boolean; onClose: () => void; bookmark: Bookmark | null; chapter: number; onBookmark: () => void; onComments: () => void }) {
  return <BottomSheet visible={visible} title="Thêm" onClose={onClose}>
    <Pressable style={sheetStyles.moreRow} onPress={onBookmark}><Ionicons name={bookmark?.chapter === chapter ? 'bookmark' : 'bookmark-outline'} size={21} color="#8F1D3F" /><View><Text style={sheetStyles.aiTitle}>{bookmark?.chapter === chapter ? 'Bỏ dấu trang' : 'Lưu vị trí đọc'}</Text><Text style={sheetStyles.aiDetail}>{bookmark ? `Đã lưu Chương ${bookmark.chapter} · ${bookmark.progress}%` : 'Chưa có dấu trang'}</Text></View></Pressable>
    <Pressable style={sheetStyles.moreRow} onPress={onComments}><Ionicons name="chatbubble-outline" size={21} color="#8F1D3F" /><View><Text style={sheetStyles.aiTitle}>Bình luận chương</Text><Text style={sheetStyles.aiDetail}>Tham gia thảo luận ở cuối chương</Text></View></Pressable>
    <Pressable style={sheetStyles.moreRow} onPress={() => Alert.alert('Báo lỗi nội dung', 'Đã ghi nhận. Tính năng gửi báo cáo sẽ kết nối với CHƯƠNG backend ở giai đoạn sau.')}><Ionicons name="flag-outline" size={21} color="#8F1D3F" /><View><Text style={sheetStyles.aiTitle}>Báo lỗi nội dung</Text><Text style={sheetStyles.aiDetail}>Gửi ghi chú cho ban biên tập</Text></View></Pressable>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  readingPage: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F0E1E5', padding: 8, borderRadius: 8, marginBottom: 25 },
  previewDark: { backgroundColor: '#41343A' }, previewText: { color: '#7E2845', fontSize: 10, fontWeight: '800' }, previewTextDark: { color: '#E2B7C5' },
  bookKicker: { fontSize: 10, letterSpacing: 1.7, fontWeight: '900', textAlign: 'center' },
  chapterNumber: { fontSize: 27, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  chapterTitle: { fontSize: 19, lineHeight: 25, fontWeight: '600', textAlign: 'center', marginTop: 5 },
  rule: { width: 30, height: 1, alignSelf: 'center', marginTop: 23, marginBottom: 26, opacity: .5 },
  paragraph: { marginBottom: 20, textAlign: 'left' },
  endMark: { textAlign: 'center', fontSize: 11, fontWeight: '700', marginTop: 17, marginBottom: 35 },
  chapterNav: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 18, flexDirection: 'row', alignItems: 'center' },
  navButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }, navRight: { justifyContent: 'flex-end' }, disabled: { opacity: .3 },
  navText: { fontSize: 11, fontWeight: '800' }, navCenter: { alignItems: 'center', paddingHorizontal: 8 }, navCenterText: { color: '#9C3153', fontSize: 9, fontWeight: '900', marginTop: 3 },
  discussion: { marginTop: 28 }, discussionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }, discussionHeading: { fontSize: 16, fontWeight: '900' },
  miniComment: { flexDirection: 'row', gap: 9, paddingVertical: 12 }, miniAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E7D7DC', alignItems: 'center', justifyContent: 'center' }, miniAvatarText: { color: '#852545', fontSize: 9, fontWeight: '900' }, miniName: { fontSize: 11, fontWeight: '900' }, miniBody: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  topbar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  topIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, topCopy: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40 }, topTitle: { fontSize: 13, fontWeight: '900', maxWidth: '95%' }, topSubtitle: { fontSize: 9, marginTop: 2 },
  toolbar: { position: 'absolute', left: 0, right: 0, bottom: 0 }
});

const sheetStyles = StyleSheet.create({
  search: { height: 45, borderRadius: 13, backgroundColor: '#F7F0EC', borderWidth: 1, borderColor: '#E2D6D0', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 8 }, input: { flex: 1, fontSize: 13, color: '#31272B' }, hint: { color: '#8A7D82', fontSize: 10, marginVertical: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 8 }, label: { color: '#3A3034', fontSize: 12, fontWeight: '900' }, labelValue: { color: '#8F1D3F', fontSize: 11, fontWeight: '800' },
  adjust: { flexDirection: 'row', alignItems: 'center', gap: 12 }, adjustButton: { width: 48, height: 42, borderRadius: 11, borderWidth: 1, borderColor: '#DCCFC9', alignItems: 'center', justifyContent: 'center' }, smallA: { color: '#473B40', fontSize: 13, fontWeight: '900' }, bigA: { color: '#473B40', fontSize: 18, fontWeight: '900' }, adjustTrack: { flex: 1, height: 4, borderRadius: 3, backgroundColor: '#E3D8D2' }, adjustFill: { height: 4, borderRadius: 3, backgroundColor: '#8F1D3F' },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: '#F1E9E5' }, segmentItem: { flex: 1, minHeight: 36, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, segmentActive: { backgroundColor: '#FFFFFF' }, segmentText: { color: '#74686D', fontSize: 10, fontWeight: '700', textAlign: 'center' }, segmentTextActive: { color: '#8F1D3F', fontWeight: '900' },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between' }, themeOption: { alignItems: 'center', minWidth: 55 }, themeCircle: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#D8CBC5', alignItems: 'center', justifyContent: 'center' }, themeActive: { borderWidth: 3, borderColor: '#A52C52' }, themeLabel: { color: '#6E6267', fontSize: 9, fontWeight: '700', marginTop: 5 },
  paddingRow: { flexDirection: 'row', alignItems: 'center', gap: 14 }, paddingDemo: { flex: 1, height: 36, borderWidth: 1, borderColor: '#E1D5CF', alignItems: 'center', justifyContent: 'center', gap: 5 },
  aiNotice: { color: '#756A6E', fontSize: 11, lineHeight: 17, backgroundColor: '#F7EFF1', padding: 11, borderLeftWidth: 3, borderLeftColor: '#8F1D3F', marginBottom: 5 }, aiRow: { flexDirection: 'row', alignItems: 'center', minHeight: 65, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2D6D0', gap: 11 }, aiIcon: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' }, aiTitle: { color: '#31272B', fontSize: 13, fontWeight: '900' }, aiDetail: { color: '#877A80', fontSize: 10, marginTop: 3 }, aiResult: { backgroundColor: '#F5EDEA', padding: 13, marginTop: 12, borderRadius: 12 }, aiResultTitle: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' }, aiResultText: { color: '#50454A', fontSize: 12, lineHeight: 18, marginTop: 5 },
  moreRow: { flexDirection: 'row', alignItems: 'center', minHeight: 65, gap: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1D5CF' }
});

const audioStyles = StyleSheet.create({
  art: { width: 92, height: 92, borderRadius: 46, alignSelf: 'center', backgroundColor: '#6D1B36', alignItems: 'center', justifyContent: 'center', marginTop: 2 }, wave: { position: 'absolute', bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 3 }, waveLine: { width: 2, height: 10, borderRadius: 2, backgroundColor: '#E6BECB' },
  title: { color: '#2B2125', fontSize: 16, fontWeight: '900', textAlign: 'center', marginTop: 13 }, sub: { color: '#84787D', fontSize: 10, textAlign: 'center', marginTop: 4 }, track: { height: 4, backgroundColor: '#E4D8D2', borderRadius: 3, marginTop: 20 }, fill: { height: 4, backgroundColor: '#8F1D3F', borderRadius: 3, alignItems: 'flex-end', justifyContent: 'center' }, thumb: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#8F1D3F' }, time: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }, timeText: { color: '#8B7E83', fontSize: 9 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 8 }, play: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' }, seconds: { position: 'absolute', top: 9, width: '100%', textAlign: 'center', color: '#55494E', fontSize: 7, fontWeight: '900' },
  optionLabel: { color: '#55494E', fontSize: 10, fontWeight: '900', marginTop: 16, marginBottom: 7 }, options: { flexDirection: 'row', justifyContent: 'space-between' }, option: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: '#F3ECE8' }, optionActive: { backgroundColor: '#8F1D3F' }, optionText: { color: '#6F6267', fontSize: 10, fontWeight: '800' }, optionTextActive: { color: '#FFFFFF' },
  timerChoice: { flex: 1, minHeight: 34, borderRadius: 9, backgroundColor: '#F3ECE8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, timerChoiceText: { color: '#6F6267', fontSize: 8, fontWeight: '800', textAlign: 'center' }
});
