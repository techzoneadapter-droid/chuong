import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Comments } from '../../components/Comments';
import { BookReviews } from '../../components/BookReviews';
import { BookCard } from '../../components/BookCard';
import { LoadingState, RetryState } from '../../components/States';
import { isSupabaseConfigured } from '../../lib/supabase';
import { BottomSheet } from '../../components/BottomSheet';
import { ChapterRow } from '../../components/ChapterRow';
import { SectionHeader } from '../../components/SectionHeader';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { AssetBookCover, ButtonArt, VipArt } from '../../components/Artwork';
import { xianxia } from '../../constants/xianxia';
import { getBook as getDemoBook } from '../../data/books';
import { useAuth } from '../../contexts/AuthContext';
import { getBookById, getBooks } from '../../services/books';
import { getChaptersByBook } from '../../services/chapters';
import { getFollowState, getLibrary, getReadingProgress, removeFromLibrary, setFollowState, setLibraryStatus } from '../../services/library';
import { downloadBookForOffline, DownloadSelection } from '../../services/downloadManager';
import { formatOfflineBytes, getOfflineBookRecords } from '../../services/offlineDownloads';
import { Book, ReadingProgress } from '../../types';

type DownloadOption = 'Chương hiện tại' | '20 chương tiếp' | 'Toàn bộ';

const downloadSelection: Record<DownloadOption, DownloadSelection> = {
  'Chương hiện tại': 'current',
  '20 chương tiếp': 'next20',
  'Toàn bộ': 'all',
};

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [book, setBook] = useState<Book>(() => getDemoBook(id));
  const [catalog, setCatalog] = useState<Book[]>([]);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const currentChapter = progress?.chapterNumber ?? Math.max(1, Math.floor(book.totalChapters * book.progress / 100));
  const [expanded, setExpanded] = useState(false);
  const [inLibrary, setInLibrary] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followingBook, setFollowingBook] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadedChapterCount, setDownloadedChapterCount] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloading, setDownloading] = useState<DownloadOption | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({ completed: 0, total: 0 });

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadError(''); setLoading(true);
      try {
        const result = await getBookById(id);
        if (!active) return; if (!result.data) throw new Error('Không tìm thấy truyện công khai.');
        const chapters = await getChaptersByBook(result.data.id);
        if (!active) return;
        const hydrated = { ...result.data, chapters: chapters.data, totalChapters: chapters.data.length || result.data.totalChapters, latestChapter: chapters.data.at(-1)?.number ?? result.data.latestChapter };
        setBook(hydrated);
        const [library, savedProgress, authorFollow, bookFollow, catalogResult, offlineRecords] = await Promise.all([
          getLibrary(user?.id), getReadingProgress(hydrated.id, user?.id),
          hydrated.authorId || result.mode === 'demo' ? getFollowState('author', hydrated.authorId ?? hydrated.author, user?.id) : false,
          getFollowState('book', hydrated.id, user?.id), getBooks(), getOfflineBookRecords(hydrated.id)
        ]);
        if (!active) return;
        setInLibrary(library.some((entry) => entry.bookId === hydrated.id)); setProgress(savedProgress); setFollowing(authorFollow); setFollowingBook(bookFollow); setCatalog(catalogResult.data);
        setDownloadedChapterCount(offlineRecords.length);
        setDownloadedBytes(offlineRecords.reduce((sum, item) => sum + item.bytes, 0));
      } catch (error) { if (active) setLoadError(error instanceof Error ? error.message : 'Không thể tải dữ liệu mới.'); }
      finally { if (active) setLoading(false); }
    };
    load(); return () => { active = false; };
  }, [id, user?.id, reload]);

  const newest = useMemo(() => [...book.chapters].reverse().slice(0, 5), [book.chapters]);
  const similar = catalog.filter((item) => item.id !== book.id && (item.genre === book.genre || item.isVip === book.isVip)).slice(0, 5);

  const openReader = (chapter = currentChapter || 1) => book.totalChapters > 0 ? router.push({ pathname: '/reader/[bookId]', params: { bookId: book.id, chapter } }) : Alert.alert('Chưa có chương', 'Tác giả chưa xuất bản chương nào cho truyện này.');
  const shareBook = () => Share.share({ message: `${book.title} — ${book.author}\nĐọc trên CHƯƠNG: Mỗi chương, một thế giới.` });
  const download = async (option: DownloadOption) => {
    if (downloading) return;
    setDownloading(option);
    setDownloadProgress({ completed: 0, total: 0 });

    try {
      const result = await downloadBookForOffline(
        book,
        downloadSelection[option],
        currentChapter || 1,
        (next) => setDownloadProgress({ completed: next.completed, total: next.total }),
      );

      const records = await getOfflineBookRecords(book.id);
      setDownloadedChapterCount(records.length);
      setDownloadedBytes(records.reduce((sum, item) => sum + item.bytes, 0));

      const notes = [
        `Đã lưu ${result.saved}/${result.requested} chương.`,
        result.locked ? `${result.locked} chương VIP chưa mở khóa nên không được tải.` : '',
        result.failed ? `${result.failed} chương tải lỗi, bạn có thể thử lại sau.` : '',
      ].filter(Boolean).join('\n');

      Alert.alert('Tải offline hoàn tất', notes);
    } catch (error) {
      Alert.alert('Không thể tải truyện', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setDownloading(null);
      setDownloadProgress({ completed: 0, total: 0 });
    }
  };
  const toggleLibrary = async () => {
    const next = !inLibrary; setInLibrary(next);
    try { if (next) await setLibraryStatus(book.id, 'reading', user?.id); else await removeFromLibrary(book.id, user?.id); }
    catch (error) { setInLibrary(!next); Alert.alert('Không thể cập nhật', error instanceof Error ? error.message : 'Vui lòng thử lại.'); }
  };
  const toggleFollow = async (kind: 'author' | 'book') => {
    const targetId = kind === 'author' ? book.authorId ?? (!isSupabaseConfigured ? book.author : undefined) : book.id;
    if (!targetId) return;
    const current = kind === 'author' ? following : followingBook; const setter = kind === 'author' ? setFollowing : setFollowingBook;
    setter(!current);
    try { await setFollowState(kind, targetId, !current, user?.id); } catch (error) { setter(current); Alert.alert('Không thể cập nhật', error instanceof Error ? error.message : 'Vui lòng thử lại.'); }
  };

  if (loading) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang mở linh quyển…" /></SafeAreaView>;
  if (loadError) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><RetryState detail={loadError} onRetry={() => setReload((value) => value + 1)} /></SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <XianxiaBackdrop />
      <View style={styles.topbar}>
        <Pressable style={styles.topButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={21} color={xianxia.ink} /></Pressable>
        <View style={styles.topTitleWrap}><Text style={styles.topKicker}>LINH QUYỂN</Text><Text style={styles.topTitle} numberOfLines={1}>{book.title}</Text></View>
        <Pressable style={styles.topButton} onPress={shareBook}><Ionicons name="share-outline" size={20} color={xianxia.ink} /></Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        {loadError ? <Pressable onPress={() => setReload((value) => value + 1)}><Text style={styles.loadError}>{loadError} · Chạm để thử lại</Text></Pressable> : null}
        <View style={styles.heroCard}>
          <View style={styles.hero}>
            <View style={styles.coverFrame}>
              <View style={styles.cover}>
                <AssetBookCover bookId={book.id} title={book.title} coverUrl={book.coverUrl} style={StyleSheet.absoluteFillObject} />
                <View pointerEvents="none" style={styles.coverShade} />
                <Text style={styles.coverBrand}>CHƯƠNG</Text>
                {book.isVip ? <View style={styles.coverVip}><VipArt width={56} /></View> : null}
              </View>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroEyebrow}>TIÊN HIỆP · LINH THƯ</Text>
              <Text style={styles.title}>{book.title}</Text>
              <Text style={styles.author}>bởi {book.author}</Text>
              <View style={styles.metrics}>
                <Metric value={`${book.rating}`} label="Đánh giá" icon="star" />
                <Metric value={book.views} label="Lượt đọc" icon="eye-outline" />
                <Metric value={book.followers} label="Theo dõi" icon="people-outline" />
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.genre}>{book.genre}</Text>
                <Text style={styles.status}>{book.status}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.tags}>{book.tags.map((tag) => <Text style={styles.tag} key={tag}>{tag}</Text>)}</View>
        <Text numberOfLines={expanded ? undefined : 3} style={styles.description}>{book.description}</Text>
        <Pressable onPress={() => setExpanded((value) => !value)}><Text style={styles.more}>{expanded ? 'Thu gọn' : 'Xem thêm'}</Text></Pressable>

        <Pressable style={styles.primary} onPress={() => openReader()}>
          <ButtonArt />
          <View style={styles.primaryGlyph}><Ionicons name="book" size={17} color={xianxia.goldSoft} /></View>
          <Text style={styles.primaryText}>{book.totalChapters === 0 ? 'Chưa có chương' : progress || book.progress > 0 ? `Đọc tiếp · Chương ${currentChapter}` : 'Mở linh quyển'}</Text>
          <Ionicons name="arrow-forward" size={17} color={xianxia.white} />
        </Pressable>
        <View style={styles.actions}>
          <Action icon={inLibrary ? 'checkmark' : 'add'} label={inLibrary ? 'Đã lưu' : 'Tủ sách'} onPress={toggleLibrary} active={inLibrary} />
          <Action icon={followingBook ? 'heart' : 'heart-outline'} label={followingBook ? 'Đang theo dõi' : 'Theo dõi truyện'} onPress={() => toggleFollow('book')} active={followingBook} />
          <Action icon={downloadedChapterCount ? 'checkmark-circle' : 'download-outline'} label={downloadedChapterCount ? `Offline · ${downloadedChapterCount}` : 'Tải truyện'} onPress={() => setDownloadOpen(true)} active={downloadedChapterCount > 0} />
          <Action icon="flag-outline" label="Báo cáo" onPress={() => user ? router.push({ pathname: '/report', params: { bookId: book.id, label: book.title } }) : router.push('/auth/login')} />
        </View>

        <View style={styles.authorSection}>
          <View style={styles.authorSeal}><Text style={styles.authorSealText}>作</Text></View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{book.author.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text></View>
          <View style={styles.authorCopy}><Text style={styles.authorKicker}>TÁC GIẢ</Text><Text style={styles.authorName}>{book.author}</Text><Text style={styles.authorFollowers}>{book.authorFollowers} người theo dõi</Text></View>
          <Pressable style={[styles.follow, following && styles.following]} onPress={() => toggleFollow('author')}><Text style={[styles.followText, following && styles.followingText]}>{following ? 'Đang theo dõi' : 'Theo dõi tác giả'}</Text></Pressable>
        </View>

        <SectionHeader title="Danh sách chương" action={`${book.totalChapters} chương`} onPress={() => router.push({ pathname: '/book/[id]/chapters', params: { id: book.id } })} />
        <View style={styles.chapterList}>
          {newest.map((chapter) => <ChapterRow key={chapter.number} chapter={chapter} onPress={() => openReader(chapter.number)} />)}
        </View>
        <Pressable style={styles.outline} onPress={() => router.push({ pathname: '/book/[id]/chapters', params: { id: book.id } })}>
          <Text style={styles.outlineText}>Xem toàn bộ chương</Text><Ionicons name="arrow-forward" size={16} color={xianxia.jadeDeep} />
        </Pressable>

        <BookReviews bookId={book.id} authorUserId={book.authorUserId} />

        <Comments bookId={book.id} />

        <SectionHeader title="Truyện tương tự" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similar}>
          {similar.map((item) => <BookCard key={item.id} book={item} compact />)}
        </ScrollView>
      </ScrollView>

      <BottomSheet visible={downloadOpen} title="Tải truyện" onClose={() => !downloading && setDownloadOpen(false)}>
        <Text style={styles.sheetNote}>Lưu nội dung đã được phép đọc trên thiết bị để dùng khi mất mạng. Chương VIP chỉ tải được sau khi đã mở khóa.</Text>
        {downloadedChapterCount > 0 ? <View style={styles.downloadSummary}>
          <Ionicons name="checkmark-circle" size={19} color="#527058" />
          <Text style={styles.downloadSummaryText}>Đã có {downloadedChapterCount} chương offline · {formatOfflineBytes(downloadedBytes)}</Text>
          <Pressable onPress={() => { setDownloadOpen(false); router.push('/downloads'); }}>
            <Text style={styles.manageDownload}>Quản lý</Text>
          </Pressable>
        </View> : null}
        {(['Chương hiện tại', '20 chương tiếp', 'Toàn bộ'] as DownloadOption[]).map((option) => {
          const isRunning = downloading === option;
          const meta = option === 'Chương hiện tại'
            ? `Chương ${currentChapter || 1}`
            : option === '20 chương tiếp'
              ? 'Tối đa 20 chương từ vị trí đang đọc'
              : `${book.totalChapters} chương công khai`;
          return (
            <Pressable key={option} style={styles.downloadRow} onPress={() => { void download(option); }} disabled={Boolean(downloading)}>
              <View style={styles.downloadIcon}><Ionicons name={isRunning ? 'cloud-download-outline' : 'download-outline'} size={18} color="#8F1D3F" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.downloadTitle}>{option}</Text>
                <Text style={styles.downloadMeta}>
                  {isRunning && downloadProgress.total
                    ? `Đang tải ${downloadProgress.completed}/${downloadProgress.total} chương`
                    : meta}
                </Text>
                {isRunning && downloadProgress.total ? <View style={styles.downloadTrack}><View style={[styles.downloadFill, { width: `${Math.min(100, downloadProgress.completed / downloadProgress.total * 100)}%` }]} /></View> : null}
              </View>
              <Ionicons name="chevron-forward" size={17} color="#A6999E" />
            </Pressable>
          );
        })}
      </BottomSheet>
    </SafeAreaView>
  );
}

function Metric({ value, label, icon }: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={styles.metric}><Ionicons name={icon} size={13} color={xianxia.gold} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Action({ icon, label, onPress, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  return <Pressable style={styles.action} onPress={onPress}><View style={[styles.actionIcon, active && styles.actionActive]}><Ionicons name={icon} size={19} color={active ? xianxia.goldSoft : xianxia.jadeDeep} /></View><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(245,239,228,.86)' },
  topButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,253,247,.90)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: xianxia.line },
  topTitleWrap: { flex: 1, marginHorizontal: 10, alignItems: 'center' },
  topKicker: { color: xianxia.cinnabar, fontSize: 7, fontWeight: '900', letterSpacing: 1.2 },
  topTitle: { maxWidth: '100%', textAlign: 'center', color: xianxia.ink, fontSize: 13, fontWeight: '900', marginTop: 2 },
  page: { paddingHorizontal: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: 'rgba(255,248,234,.93)' },
  heroCard: { marginTop: 14, borderRadius: 23, backgroundColor: '#27423B', borderWidth: 1, borderColor: '#4A685F', overflow: 'hidden', padding: 15, shadowColor: '#17231F', shadowOpacity: .14, shadowRadius: 13, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  hero: { flexDirection: 'row', gap: 17, zIndex: 2 },
  coverFrame: { borderRadius: 17, padding: 2, backgroundColor: xianxia.goldSoft, alignSelf: 'flex-start' },
  cover: { width: 126, height: 188, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.20)' },
  coverBrand: { position: 'absolute', left: 9, top: 8, color: 'rgba(255,253,248,.92)', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1, zIndex: 2, textShadowColor: 'rgba(0,0,0,.5)', textShadowRadius: 4 },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,20,18,.07)' },
  coverVip: { position: 'absolute', left: 7, bottom: 6, zIndex: 3 },
  coverSeal: { position: 'absolute', right: 7, top: 7, width: 23, height: 23, borderRadius: 7, backgroundColor: 'rgba(132,50,41,.84)', borderWidth: 1, borderColor: 'rgba(229,209,163,.72)', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  coverSealText: { color: '#F3D99D', fontSize: 10, fontWeight: '900' },
  heroInfo: { flex: 1, paddingVertical: 4 },
  heroEyebrow: { color: xianxia.goldSoft, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: xianxia.white, fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 8 },
  author: { color: xianxia.goldSoft, fontSize: 11, fontWeight: '800', marginTop: 5 },
  metrics: { flexDirection: 'row', marginTop: 17, gap: 7 },
  metric: { flex: 1, minWidth: 0, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.07)', paddingVertical: 7, paddingHorizontal: 6 },
  metricValue: { color: xianxia.white, fontSize: 12, fontWeight: '900', marginTop: 2 },
  metricLabel: { color: 'rgba(255,253,248,.58)', fontSize: 6.5, marginTop: 2 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  genre: { color: xianxia.goldSoft, backgroundColor: 'rgba(229,209,163,.10)', borderWidth: 1, borderColor: 'rgba(229,209,163,.30)', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, fontSize: 8, fontWeight: '900' },
  status: { color: '#CFE5D4', backgroundColor: 'rgba(99,146,108,.14)', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, fontSize: 8, fontWeight: '900' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 18 },
  tag: { color: xianxia.inkSoft, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,253,247,.66)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, fontSize: 9, fontWeight: '800' },
  description: { color: xianxia.inkSoft, fontSize: 13, lineHeight: 21, marginTop: 14 },
  more: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900', marginTop: 5 },
  primary: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 20, paddingHorizontal: 28 },
  primaryGlyph: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(229,209,163,.10)', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: xianxia.white, fontSize: 13, fontWeight: '900', flex: 1, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15 },
  action: { alignItems: 'center', minWidth: 72, maxWidth: 86 },
  actionIcon: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: '#B8CBBF', backgroundColor: xianxia.jadeMist, alignItems: 'center', justifyContent: 'center' },
  actionActive: { backgroundColor: xianxia.jadeDeep, borderColor: '#496A61' },
  actionText: { color: xianxia.inkSoft, fontSize: 8, lineHeight: 11, fontWeight: '800', marginTop: 5, textAlign: 'center' },
  authorSection: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,253,247,.78)', padding: 13, marginTop: 23 },
  authorSeal: { width: 30, height: 30, borderRadius: 9, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  authorSealText: { color: '#F4DDA8', fontSize: 13, fontWeight: '900' },
  avatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: xianxia.jadeDeep, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: xianxia.goldSoft, fontSize: 12, fontWeight: '900' },
  authorCopy: { flex: 1, marginLeft: 10 },
  authorKicker: { color: xianxia.cinnabar, fontSize: 6.5, fontWeight: '900', letterSpacing: 1 },
  authorName: { color: xianxia.ink, fontSize: 13, fontWeight: '900', marginTop: 2 },
  authorFollowers: { color: xianxia.muted, fontSize: 8.5, marginTop: 2 },
  follow: { borderWidth: 1, borderColor: '#91AA9B', backgroundColor: xianxia.jadeMist, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8 },
  following: { borderColor: xianxia.line, backgroundColor: '#EEE8DE' },
  followText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900' },
  followingText: { color: xianxia.muted },
  chapterList: { borderTopWidth: 1, borderTopColor: xianxia.line },
  outline: { height: 46, borderWidth: 1, borderColor: '#AFC4B7', backgroundColor: xianxia.jadeMist, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14 },
  outlineText: { color: xianxia.jadeDeep, fontSize: 11, fontWeight: '900' },
  ratingLine: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: xianxia.line },
  ratingValue: { color: xianxia.ink, fontSize: 38, fontWeight: '900' },
  stars: { color: xianxia.gold, fontSize: 16, letterSpacing: 2 },
  ratingMeta: { color: xianxia.muted, fontSize: 9, marginTop: 3 },
  comment: { flexDirection: 'row', gap: 11, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line },
  commentAvatar: { width: 35, height: 35, borderRadius: 11, backgroundColor: xianxia.jadeMist, alignItems: 'center', justifyContent: 'center' },
  commentAvatarText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900' },
  commentBody: { flex: 1 },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between' },
  commentName: { color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  commentText: { color: xianxia.inkSoft, fontSize: 12, lineHeight: 18, marginTop: 5 },
  commentTime: { color: xianxia.muted, fontSize: 8, marginTop: 5 },
  commentActions: { flexDirection: 'row', gap: 18, marginTop: 8 },
  commentAction: { color: xianxia.muted, fontSize: 9, fontWeight: '800' },
  liked: { color: xianxia.cinnabar },
  similar: { paddingRight: 6, paddingBottom: 5 },
  sheetNote: { color: xianxia.muted, fontSize: 11, lineHeight: 17, marginBottom: 10 },
  downloadRow: { flexDirection: 'row', alignItems: 'center', minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, gap: 12 },
  downloadIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: xianxia.jadeMist, alignItems: 'center', justifyContent: 'center' },
  downloadTitle: { color: xianxia.ink, fontSize: 13, fontWeight: '900' },
  downloadMeta: { color: xianxia.muted, fontSize: 9, marginTop: 3 },
  downloadSummary: { minHeight: 46, borderRadius: 12, backgroundColor: '#E7EFE9', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  downloadSummaryText: { flex: 1, color: '#527058', fontSize: 9, fontWeight: '800' },
  manageDownload: { color: xianxia.cinnabar, fontSize: 9, fontWeight: '900' },
  downloadTrack: { height: 3, borderRadius: 99, backgroundColor: '#E2D9CC', overflow: 'hidden', marginTop: 7 },
  downloadFill: { height: 3, borderRadius: 99, backgroundColor: xianxia.jadeDeep },
  loadError: { color: xianxia.danger, backgroundColor: '#F5E5E1', padding: 9, borderRadius: 9, fontSize: 10, textAlign: 'center' },
});
