import { createReaderEngine } from '../../lib/readerEngine';
import { scheduleIdle } from '../../lib/scheduleIdle';
import { recordReaderDuration } from '../../lib/readerPerformance';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getConnectivityState, isInternetReachable } from '../../services/connectivity';
import { premiumPrice, SpiritCurrency } from '../../services/spiritStones';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, NativeScrollEvent, NativeSyntheticEvent, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingState, EmptyState, RetryState } from '../../components/States';
import { useReadingProgressSync } from '../../hooks/useReadingProgressSync';
import { useReaderGestures } from '../../hooks/useReaderGestures';
import { useReadingAnalytics } from '../../hooks/useReadingAnalytics';
import { messageForError } from '../../services/errors';
import { AdBanner } from '../../components/AdBanner';
import { AuthorGiftSheet } from '../../components/AuthorGiftSheet';
import { Comments } from '../../components/Comments';
import { BottomSheet } from '../../components/BottomSheet';
import { ArtDivider, ButtonArt } from '../../components/Artwork';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import { ChapterRow } from '../../components/ChapterRow';
import { ReaderToolbar, ReaderTool } from '../../components/ReaderToolbar';
import { getBook as getDemoBook } from '../../data/books';
import { getChapterContent } from '../../data/readerContent';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useTtsPlayer } from '../../hooks/useTtsPlayer';
import { defaultReaderSettings } from '../../services/storage';
import { shareQuote } from '../../services/sharing';
import { getBookById } from '../../services/books';
import { ContentLockedError, getChapter, getChaptersByBook } from '../../services/chapters';
import { unlockBook, unlockChapter, UnlockError } from '../../services/entitlements';
import { getWallet } from '../../services/wallet';
import { getBookmarks, getReadingProgress, toggleBookmark as persistBookmark } from '../../services/library';
import { getOfflineBookSnapshot } from '../../services/offlineDownloads';
import { useAuth } from '../../contexts/AuthContext';
import { SLEEP_TIMERS, SleepTimer, TTS_SPEEDS, TTS_VOICES, TtsVoice } from '../../services/tts';
import { Book, Chapter, ReaderAutoScrollSpeed, ReaderFont, ReaderMode, ReaderSettings, ReaderSpacing, ReaderTheme } from '../../types';
import { displayChapterTitle } from '../../services/contentText';

type Sheet = ReaderTool | null;
type Bookmark = { chapter: number; progress: number; updatedAt: string };

const themes: Record<ReaderTheme, { bg: string; text: string; muted: string; bar: string }> = {
  white: { bg: '#FFFFFF', text: '#282326', muted: '#837A7E', bar: '#FFFFFF' },
  paper: { bg: '#F4EBD8', text: '#2B2A24', muted: '#766F66', bar: '#FFF8EA' },
  night: { bg: '#27282C', text: '#DAD5CD', muted: '#A9A49D', bar: '#211F20' },
  amoled: { bg: '#000000', text: '#D1CDCA', muted: '#8D8986', bar: '#080808' }
};

export default function ReaderScreen() {
  const params = useLocalSearchParams<{ bookId: string; chapter?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();
  const [book, setBook] = useState<Book>(() => getDemoBook(params.bookId));
  const initialChapter = Math.min(book.totalChapters, Math.max(1, Number(params.chapter) || 1));
  const [chapterNumber, setChapterNumber] = useState(initialChapter);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [settings, setSettings] = usePersistentState<ReaderSettings>('reader:settings', defaultReaderSettings);
  const [bookmarked, setBookmarked] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [preparedContent, setPreparedContent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lockedContent, setLockedContent] = useState<ContentLockedError | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [premiumBalance, setPremiumBalance] = useState<number | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [offlineReading, setOfflineReading] = useState(false);
  const [reload, setReload] = useState(0);
  const [progressReady, setProgressReady] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [quoteToShare, setQuoteToShare] = useState<string | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [sharingQuote, setSharingQuote] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const scrollPosition = useRef(0);
  const navigationPending = useRef(false);
  const textBounds = useRef({ bottom: 0, viewport: 0 });
  const recentPositions = useRef(new Map<number, { scrollPosition: number; progressPercent: number }>());
  const arrival = useRef<{ number: number; end: boolean; position?: { scrollPosition: number; progressPercent: number } } | null>(null);
  const pendingRestore = useRef<{ number: number; y: number; end?: boolean } | null>(null);
  const pendingLayout = useRef<{ number: number; started: number } | null>(null);
  const resumeAudio = useRef(false);
  const consumeAudioResume = useCallback(() => { resumeAudio.current = false; }, []);
  const readerEngine = useMemo(() => {
    let canonicalBookId = params.bookId;
    return createReaderEngine({
      loadCatalog: async () => {
        if (isSupabaseConfigured && !(await getConnectivityState()).connected) {
          const offlineBook = await getOfflineBookSnapshot(params.bookId);
          if (!offlineBook) throw new Error('Không có kết nối mạng.');
          canonicalBookId = offlineBook.id;
          return { hydrated: offlineBook, localOnly: true };
        }
        try {
          const result = await getBookById(params.bookId);
          if (!result.data) throw new Error('Không tìm thấy truyện công khai.');
          canonicalBookId = result.data.id;
          const chapters = await getChaptersByBook(result.data.id);
          return { hydrated: { ...result.data, chapters: chapters.data, totalChapters: chapters.data.length },
            localOnly: result.mode === 'offline' || chapters.mode === 'offline' };
        } catch (cause) {
          const offlineBook = await getOfflineBookSnapshot(params.bookId);
          if (!offlineBook) throw cause;
          canonicalBookId = offlineBook.id;
          return { hydrated: offlineBook, localOnly: true };
        }
      },
      cacheCatalog: (catalog) => !catalog.localOnly,
      loadChapter: (number) => getChapter(canonicalBookId, number),
    });
  }, [params.bookId, user?.id, reload]);
  const loadedRoute = useRef<{ engine: typeof readerEngine; chapter?: string } | null>(null);
  useEffect(() => {
    resumeAudio.current = false;
    recentPositions.current.clear();
    arrival.current = null;
    navigationPending.current = false;
    return () => readerEngine.dispose();
  }, [readerEngine]);

  useEffect(() => { if (sheet === 'audio') setAudioInitialized(true); }, [sheet]);

  const chapterIndex = useMemo(() => book.chapters.findIndex((item) => item.number === chapterNumber), [book.chapters, chapterNumber]);
  const selectedChapter = book.chapters[chapterIndex];
  const chapter = selectedChapter ?? { number: chapterNumber, title: '', content: '', id: undefined };
  const chapterDisplayTitle = displayChapterTitle(chapter.title, chapterNumber);
  const previousNumber = book.chapters[chapterIndex - 1]?.number;
  const nextNumber = book.chapters[chapterIndex + 1]?.number;
  const chapterReady = progressReady && loadedRoute.current?.engine === readerEngine && loadedRoute.current.chapter === params.chapter;
  const sync = useReadingProgressSync({ bookId: book.id, chapterId: chapter.id, chapterNumber, progressPercent: readingProgress, scrollPosition: scrollPosition.current }, user?.id, chapterReady && Boolean(selectedChapter), () => scrollPosition.current);
  const analytics = useReadingAnalytics(
    { bookId: book.id, chapterId: chapter.id, chapterNumber, progressPercent: readingProgress },
    chapterReady && Boolean(selectedChapter?.id) && !offlineReading && !lockedContent
  );
  const exitReader = () => {
    void sync.flush();
    void analytics.flush();
    if (offlineReading) {
      router.replace('/downloads');
      return;
    }
    router.replace({ pathname: '/book/[id]', params: { id: book.id } });
  };
  const content = preparedContent;
  const audioText = useMemo(() => audioInitialized || sheet === 'audio' ? content.join('\n\n') : '', [audioInitialized, sheet === 'audio', content]);
  const pagedContent = useMemo(() => {
    if (settings.mode !== 'page') return [];
    const spacingFactor = settings.spacing === 'compact' ? 1.12 : settings.spacing === 'relaxed' ? .82 : 1;
    const target = Math.max(520, Math.round(1120 * (18 / settings.fontSize) * spacingFactor));
    const pages: string[][] = [];
    let current: string[] = [];
    let size = 0;
    for (const paragraph of content) {
      const nextSize = size + paragraph.length + 2;
      if (current.length && nextSize > target) {
        pages.push(current);
        current = [];
        size = 0;
      }
      current.push(paragraph);
      size += paragraph.length + 2;
    }
    if (current.length || !pages.length) pages.push(current);
    return pages;
  }, [content, settings.fontSize, settings.spacing, settings.mode]);
  const visibleContent = settings.mode === 'page' ? (pagedContent[pageIndex] ?? pagedContent[0] ?? []) : content;
  const bookmark: Bookmark | null = bookmarked ? { chapter: chapterNumber, progress: readingProgress, updatedAt: new Date().toISOString() } : null;
  const palette = themes[settings.theme];
  const dark = settings.theme === 'night' || settings.theme === 'amoled';
  const lineHeight = settings.fontSize * ({ compact: 1.5, normal: 1.72, relaxed: 1.95 }[settings.spacing]);
  const fontFamily = settings.font === 'serif' ? 'Georgia' : settings.font === 'sans' ? 'Arial' : undefined;
  const filteredChapters = useMemo(() => {
    const value = chapterSearch.trim().toLowerCase().replace('chương', '').trim();
    if (!value) return book.chapters.slice(Math.max(0, chapterIndex - 4), chapterIndex + 6);
    return book.chapters.filter((item) => String(item.number).includes(value) || item.title.toLowerCase().includes(value)).slice(0, 30);
  }, [book.chapters, chapterIndex, chapterSearch]);

  useEffect(() => {
    if (!lockedContent || lockedContent.kind !== 'chapter' || !selectedChapter?.earlyAccessUntil) return;
    const remaining = new Date(selectedChapter.earlyAccessUntil).getTime() - Date.now();
    if (remaining <= 0) {
      setReload((value) => value + 1);
      return;
    }
    const timer = setTimeout(() => setReload((value) => value + 1), remaining + 400);
    return () => clearTimeout(timer);
  }, [lockedContent, selectedChapter?.earlyAccessUntil]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setProgressReady(false);
    setLoading(true);
    setLoadError('');
    setLockedContent(null);
    setUnlockError('');

    const opened = performance.now();
    const load = async () => {
      try {
        const catalogStarted = performance.now();
        let catalog = await readerEngine.catalog();
        if (!active) return;
        const explicitChapter = Number(params.chapter);
        if (explicitChapter && !catalog.hydrated.chapters.some(item => item.number === explicitChapter)) {
          // A publication link may target a chapter newer than the cached metadata snapshot.
          catalog = await readerEngine.catalog(true);
          if (!active) return;
        }
        recordReaderDuration('catalog', catalogStarted);
        const hydrated = catalog.hydrated;
        let localOnly = catalog.localOnly;

        const [saved, marks] = await Promise.all([
          getReadingProgress(hydrated.id, user?.id).catch(() => null),
          getBookmarks(hydrated.id, user?.id).catch(() => []),
        ]);
        const requested = Number(params.chapter) || saved?.chapterNumber;
        const targetChapter = requested && hydrated.chapters.some((item) => item.number === requested)
          ? requested
          : hydrated.chapters[0]?.number ?? 1;

        if (!active) return;
        setBook(hydrated);
        setChapterNumber(targetChapter);

        let selected: Awaited<ReturnType<typeof getChapter>> | null = null;
        let paragraphs: string[] = [];
        try {
          if (hydrated.chapters.length) {
            const chapterStarted = performance.now();
            const loaded = await readerEngine.read(targetChapter);
            if (!active) return;
            recordReaderDuration('chapter-and-text', chapterStarted);
            selected = loaded.result;
            paragraphs = loaded.paragraphs;
          }
        } catch (cause) {
          if (cause instanceof ContentLockedError) {
            if (!active) return;
            resumeAudio.current = false;
            setLockedContent(cause);
            if (user) {
              try {
                const wallet = await getWallet(user.id);
                if (active) { setWalletBalance(wallet.low_spirit_stones); setPremiumBalance(wallet.high_spirit_stones); }
              } catch {
                if (active) { setWalletBalance(null); setPremiumBalance(null); }
              }
            } else {
              setWalletBalance(null); setPremiumBalance(null);
            }
            return;
          }
          throw cause;
        }

        if (!active) return;
        if (hydrated.chapters.length && !selected?.data) throw new Error('Chương này chưa được xuất bản hoặc không còn khả dụng.');

        localOnly = localOnly || selected?.mode === 'offline';
        setOfflineReading(localOnly);
        setPreparedContent(selected?.data?.content ? paragraphs : getChapterContent(targetChapter));
        setBook({
          ...hydrated,
          chapters: hydrated.chapters.map((item) =>
            item.number === targetChapter && selected?.data ? selected.data : item
          ),
        });
        const landing = arrival.current?.number === targetChapter ? arrival.current : null;
        const restored = landing ? landing.position : saved?.chapterNumber === targetChapter ? saved : null;
        setReadingProgress(landing?.end ? 100 : restored?.progressPercent ?? 0);
        scrollPosition.current = landing?.end ? 0 : restored?.scrollPosition ?? 0;
        arrival.current = null;
        if (!active) return;
        setBookmarked(marks.some((item) => item.chapterNumber === targetChapter));
        pendingRestore.current = landing?.end ? { number: targetChapter, y: 0, end: true }
          : scrollPosition.current > 0 ? { number: targetChapter, y: scrollPosition.current } : null;
        pendingLayout.current = { number: targetChapter, started: performance.now() };
        loadedRoute.current = { engine: readerEngine, chapter: params.chapter };
        setProgressReady(true);
        recordReaderDuration('open-to-ready', opened);
      } catch (cause) {
        if (active) { resumeAudio.current = false; setLoadError(messageForError(cause, 'Không thể tải nội dung.')); }
      } finally {
        if (active) { navigationPending.current = false; setLoading(false); }
      }
    };

    load();
    return () => { active = false; pendingRestore.current = null; pendingLayout.current = null; };
  }, [authLoading, params.bookId, params.chapter, user?.id, reload, readerEngine]);

  useFocusEffect(useCallback(() => {
    if (loading || !progressReady || offlineReading || lockedContent || book.isVip) return;
    let active = true;
    let cancelIdle: (() => void) | undefined;
    const timer = setTimeout(() => {
      cancelIdle = scheduleIdle(() => {
        void (async () => {
          if (!(await isInternetReachable())) return;
          // One speculative request at a time, at most the two actual adjacent free chapters.
          for (const number of [nextNumber, previousNumber]) {
            if (!active || AppState.currentState !== 'active') return;
            const metadata = book.chapters.find(item => item.number === number);
            if (!metadata || metadata.access !== 'free' || metadata.configuredVip || readerEngine.hasPrepared(metadata.number)) continue;
            await readerEngine.read(metadata.number).catch(() => undefined);
          }
        })();
      });
    }, 500);
    return () => { active = false; clearTimeout(timer); cancelIdle?.(); };
  }, [loading, progressReady, offlineReading, lockedContent, book.isVip, book.chapters, nextNumber, previousNumber, readerEngine]));

  const goChapter = (number: number, continueAudio = false) => {
    if (loading || navigationPending.current) return;
    if (!book.chapters.some((item) => item.number === number)) return;
    if (number === chapterNumber) { setSheet(null); setChapterSearch(''); return; }
    navigationPending.current = true;
    recentPositions.current.delete(chapterNumber);
    recentPositions.current.set(chapterNumber, { scrollPosition: scrollPosition.current, progressPercent: readingProgress });
    if (recentPositions.current.size > 3) recentPositions.current.delete(recentPositions.current.keys().next().value!);
    const backwards = number === previousNumber;
    arrival.current = { number, end: backwards && settings.previousChapterLanding === 'end',
      position: backwards ? recentPositions.current.get(number) : undefined };
    void sync.flush();
    void analytics.flush();
    resumeAudio.current = continueAudio;
    setProgressReady(false);
    setLoading(true);
    const next = number;
    setSheet(null);
    setChapterSearch('');
    setReadingProgress(0);
    setPageIndex(0);
    setBookmarked(false);
    setAutoScrolling(false);
    scrollPosition.current = 0;
    textBounds.current.bottom = 0;
    router.setParams({ chapter: String(next) });
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const restoreReaderPosition = () => {
    const restore = pendingRestore.current;
    if (restore?.number !== chapterNumber || settings.mode !== 'scroll') return;
    if (restore.end && (!textBounds.current.bottom || !textBounds.current.viewport)) return;
    pendingRestore.current = null;
    const y = restore.end ? Math.max(0, textBounds.current.bottom - textBounds.current.viewport) : restore.y;
    scrollPosition.current = y;
    scrollRef.current?.scrollTo({ y, animated: false });
  };
  const onReaderContentSizeChange = () => {
    const layout = pendingLayout.current;
    if (layout?.number === chapterNumber) {
      pendingLayout.current = null;
      recordReaderDuration('ready-to-layout', layout.started);
    }
    restoreReaderPosition();
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (settings.mode === 'page') return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollPosition.current = contentOffset.y;
    const max = contentSize.height - layoutMeasurement.height;
    const progress = max > 0 ? Math.min(100, Math.round(contentOffset.y / max * 100)) : 100;
    setReadingProgress(progress);
    if (autoScrolling && max > 0 && contentOffset.y >= max - 2) {
      setAutoScrolling(false);
      setControlsVisible(true);
    }
  };

  const goReaderPage = (nextIndex: number) => {
    const clamped = Math.min(Math.max(0, nextIndex), Math.max(0, pagedContent.length - 1));
    setPageIndex(clamped);
    const percent = pagedContent.length ? Math.round(((clamped + 1) / pagedContent.length) * 100) : 100;
    setReadingProgress(percent);
    scrollPosition.current = clamped;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const pagePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      settings.mode === 'page'
      && Math.abs(gesture.dx) > 18
      && Math.abs(gesture.dx) > Math.abs(gesture.dy)
    ),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx <= -45 && pageIndex < pagedContent.length - 1) goReaderPage(pageIndex + 1);
      if (gesture.dx >= 45 && pageIndex > 0) goReaderPage(pageIndex - 1);
    },
  }), [pageIndex, pagedContent.length, settings.mode]);

  const chapterGestures = useReaderGestures({
    enabled: !loading && chapterReady && !navigationPending.current && !lockedContent && !sheet && !giftOpen && !quoteToShare,
    horizontal: Boolean(settings.horizontalChapterGestures),
    vertical: settings.mode === 'scroll' && Boolean(settings.boundaryChapterGestures),
    sensitivity: settings.gestureSensitivity ?? 'medium',
    chapterKey: `${book.id}:${chapterNumber}`,
    start: () => ({ x: 0, y: 0, width: windowSize.width, height: windowSize.height,
      topInset: insets.top, bottomInset: insets.bottom, leftInset: insets.left, rightInset: insets.right,
      atTop: scrollPosition.current <= 2,
      atBottom: textBounds.current.bottom > 0 && scrollPosition.current + textBounds.current.viewport >= textBounds.current.bottom - 2,
      previous: previousNumber !== undefined, next: nextNumber !== undefined }),
    navigate: (direction) => {
      const number = direction === 'next' ? nextNumber : previousNumber;
      if (number !== undefined) goChapter(number);
    },
  });

  useEffect(() => {
    if (settings.mode !== 'page') return;
    setPageIndex(0);
    setReadingProgress(pagedContent.length ? Math.round(100 / pagedContent.length) : 100);
    scrollPosition.current = 0;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  }, [chapterNumber, settings.mode, settings.fontSize, settings.spacing, settings.padding, pagedContent.length]);

  useEffect(() => {
    if (settings.mode !== 'page' || !progressReady || !pagedContent.length) return;
    const target = Math.min(pagedContent.length - 1, Math.max(0, Math.floor(readingProgress / 100 * pagedContent.length)));
    setPageIndex(target);
    scrollPosition.current = target;
  }, [chapterNumber, pagedContent.length, progressReady, settings.mode]);

  useEffect(() => {
    const tag = 'chuong-reader';
    if (!settings.keepAwake) {
      void deactivateKeepAwake(tag).catch(() => undefined);
      return;
    }
    void activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => { void deactivateKeepAwake(tag).catch(() => undefined); };
  }, [settings.keepAwake]);

  useEffect(() => {
    if (!autoScrolling || settings.mode !== 'scroll' || loading || lockedContent) return;
    const speedMap: Record<ReaderAutoScrollSpeed, number> = { 1: 14, 2: 24, 3: 38, 4: 56 };
    const speed = speedMap[(settings.autoScrollSpeed ?? 2) as ReaderAutoScrollSpeed] ?? 24;
    const interval = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      const next = scrollPosition.current + speed / 20;
      scrollRef.current?.scrollTo({ y: next, animated: false });
    }, 50);
    return () => clearInterval(interval);
  }, [autoScrolling, loading, lockedContent, settings.autoScrollSpeed, settings.mode]);

  useEffect(() => {
    if (settings.mode !== 'scroll' && autoScrolling) {
      setAutoScrolling(false);
      setControlsVisible(true);
    }
  }, [autoScrolling, settings.mode]);

  const toggleAutoScroll = (enabled: boolean) => {
    if (settings.mode !== 'scroll' && enabled) return;
    setAutoScrolling(enabled);
    if (enabled) {
      setSheet(null);
      setControlsVisible(false);
    } else {
      setControlsVisible(true);
    }
  };

  const openQuoteShare = useCallback((quote: string) => {
    if (!quote.trim()) return;
    setAutoScrolling(false);
    setControlsVisible(true);
    setSheet(null);
    setShareNotice('');
    setQuoteToShare(quote);
  }, []);

  const paragraphElements = useMemo(() => visibleContent.map((paragraph, index) => (
    <Text
      key={`${chapterNumber}-${pageIndex}-${index}`}
      style={[styles.paragraph, { color: palette.text, fontSize: settings.fontSize, lineHeight, fontFamily }]}
      onLongPress={(event) => {
        event.stopPropagation?.();
        openQuoteShare(paragraph);
      }}
      suppressHighlighting
    >
      {paragraph}
    </Text>
  )),
    [visibleContent, chapterNumber, pageIndex, palette.text, settings.fontSize, lineHeight, fontFamily, openQuoteShare]);

  const shareCurrentQuote = async () => {
    if (!quoteToShare || sharingQuote) return;
    setSharingQuote(true);
    setShareNotice('');
    try {
      const result = await shareQuote({
        bookId: book.id,
        bookTitle: book.title,
        authorName: book.author,
        chapterNumber,
        chapterTitle: chapterDisplayTitle,
        quote: quoteToShare,
      });
      if (result === 'copied') setShareNotice('Đã sao chép trích đoạn và liên kết đọc.');
      if (result === 'unavailable') setShareNotice('Thiết bị này chưa hỗ trợ chia sẻ hoặc sao chép tự động.');
    } catch {
      setShareNotice('Chưa thể chia sẻ trích đoạn. Vui lòng thử lại.');
    } finally {
      setSharingQuote(false);
    }
  };

  const shareNearReadingPosition = () => {
    if (!content.length) return;
    const index = Math.min(content.length - 1, Math.max(0, Math.floor((readingProgress / 100) * content.length)));
    openQuoteShare(content[index] ?? content[0]);
  };

  const toggleBookmark = async () => {
    const previous = bookmarked; setBookmarked(!previous);
    try { const next = await persistBookmark({ bookId: book.id, chapterId: chapter.id, chapterNumber, position: readingProgress, note: null }, user?.id); setBookmarked(next); }
    catch (cause) { setBookmarked(previous); setLoadError(messageForError(cause, 'Không thể lưu dấu trang.')); }
  };

  const chooseTool = (tool: ReaderTool) => {
    if (autoScrolling) setAutoScrolling(false);
    setSheet(tool);
    setControlsVisible(true);
  };

  const unlockCurrent = async (currency: SpiritCurrency = 'low') => {
    if (unlocking) return;
    if (!lockedContent) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }
    setUnlocking(true);
    setUnlockError('');
    try {
      const result = lockedContent.kind === 'book'
        ? await unlockBook(book.id, currency)
        : await unlockChapter(lockedContent.chapterId, currency);
      currency === 'high' ? setPremiumBalance(result.balanceCoins) : setWalletBalance(result.balanceCoins);
      setReload((value) => value + 1);
    } catch (cause) {
      if (cause instanceof UnlockError && cause.code === 'INSUFFICIENT_COINS') {
        setUnlockError('Số dư loại Linh Thạch đã chọn không đủ để mở khóa nội dung này.');
      } else {
        setUnlockError(messageForError(cause, 'Không thể mở khóa nội dung.'));
      }
    } finally {
      setUnlocking(false);
    }
  };

  if (loading) return <View style={styles.root}><XianxiaBackdrop opacity={.34} /><LoadingState label={navigationPending.current ? 'Đang chuyển chương…' : 'Đang mở linh quyển…'} /></View>;
  if (loadError) return <View style={styles.root}><XianxiaBackdrop opacity={.34} /><RetryState detail={loadError} onRetry={() => setReload((value) => value + 1)} /></View>;

  if (lockedContent) {
    const enough = walletBalance !== null && walletBalance >= lockedContent.priceCoins;
    const highPrice = premiumPrice(lockedContent.priceCoins);
    const enoughHigh = premiumBalance !== null && premiumBalance >= highPrice;
    const earlyAccessUntil = lockedContent.kind === 'chapter' ? selectedChapter?.earlyAccessUntil ?? null : null;
    const earlyAccessActive = Boolean(earlyAccessUntil && new Date(earlyAccessUntil).getTime() > Date.now());
    const earlyAccessLabel = earlyAccessActive && earlyAccessUntil
      ? new Date(earlyAccessUntil).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
      : '';
    return (
      <View style={[styles.root, styles.paywallRoot, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 }]}>
        <XianxiaBackdrop opacity={.42} />
        <StatusBar style="dark" />
        <View style={styles.paywallTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Quay lại trang truyện" style={styles.topIcon} onPress={exitReader}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
          <Text style={styles.paywallTopTitle}>{book.title}</Text>
          <View style={styles.topIcon} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}><View style={styles.paywallCard}>
          <View style={styles.lockCircle}><Ionicons name="lock-closed" size={28} color="#8F1D3F" /></View>
          <Text style={styles.paywallKicker}>{lockedContent.kind === 'book' ? 'TRUYỆN VIP' : earlyAccessActive ? 'TIÊN CƠ · ĐỌC SỚM' : 'CHƯƠNG VIP'}</Text>
          <Text style={styles.paywallTitle}>Chương {chapterNumber} · {displayChapterTitle(selectedChapter?.title, chapterNumber) || 'Nội dung dành cho thành viên'}</Text>
          <Text style={styles.paywallBody}>
            {lockedContent.kind === 'book'
              ? 'Mở khóa truyện một lần để đọc các nội dung VIP thuộc gói truyện này.'
              : earlyAccessActive
                ? `Bạn có thể dùng Hạ Phẩm Linh Thạch để đọc chương này ngay, hoặc chờ đến ${earlyAccessLabel} khi chương tự mở miễn phí.`
                : 'Mở khóa chương này một lần. Quyền đọc được lưu vào tài khoản của bạn.'}
          </Text>
          <View style={styles.pricePill}><Text style={styles.priceText}>{lockedContent.priceCoins} Hạ Phẩm · hoặc {highPrice} Thượng Phẩm</Text></View>
          {earlyAccessActive ? <Text style={styles.earlyAccessPaywall}>Tự mở miễn phí · {earlyAccessLabel}</Text> : null}
          {user ? <Text style={styles.balanceText}>Số dư hiện tại: {walletBalance === null ? 'Đang cập nhật…' : `${walletBalance} Hạ Phẩm · ${premiumBalance ?? 0} Thượng Phẩm`}</Text> : <Text style={styles.balanceText}>Đăng nhập để đồng bộ quyền đọc trên các thiết bị.</Text>}
          {unlockError ? <Text style={styles.unlockError}>{unlockError}</Text> : null}
          {!user ? <Pressable style={styles.unlockButton} onPress={() => router.push('/auth/login')}><ButtonArt /><Text style={styles.unlockButtonText}>Đăng nhập để mở khóa</Text></Pressable> : <>
            <Pressable accessibilityRole="button" style={[styles.unlockButton, (!enough || unlocking) && styles.unlockDisabled]} disabled={!enough || unlocking} onPress={() => void unlockCurrent('low')}>
              <ButtonArt /><Text style={styles.unlockButtonText}>{unlocking ? 'Đang mở khóa…' : `Mở khóa bằng Hạ Phẩm · ${lockedContent.priceCoins}`}</Text>
            </Pressable>
            {!enough ? <View style={{ gap: 10, marginVertical: 12 }}>
              <Pressable onPress={() => router.push('/rewards?quest=rewarded_ad')}><Text style={styles.balanceText}>Xem quảng cáo để nhận Hạ Phẩm</Text></Pressable>
              <Pressable onPress={() => router.push('/rewards')}><Text style={styles.balanceText}>Làm nhiệm vụ để nhận Hạ Phẩm</Text></Pressable>
            </View> : null}
            <Pressable accessibilityRole="button" style={[styles.unlockButton, (!enoughHigh || unlocking) && styles.unlockDisabled]} disabled={!enoughHigh || unlocking} onPress={() => void unlockCurrent('high')}>
              <ButtonArt /><Text style={styles.unlockButtonText}>{unlocking ? 'Đang mở khóa…' : `Mở khóa bằng Thượng Phẩm · ${highPrice}`}</Text>
            </Pressable>
            {!enoughHigh ? <Pressable onPress={() => router.push('/wallet/store')} style={{ paddingVertical: 12 }}><Text style={styles.balanceText}>Nạp Thượng Phẩm Linh Thạch</Text></Pressable> : null}
          </>}
          <Text style={styles.paywallSafety}>{earlyAccessActive ? 'Nếu chọn đọc sớm, quyền đọc được lưu ngay trên tài khoản. Khi Tiên Cơ hết hạn, mọi độc giả sẽ đọc chương này miễn phí.' : 'Hạ Phẩm hoặc Thượng Phẩm chỉ bị trừ khi quyền đọc được cấp thành công.'}</Text>
        </View></ScrollView>
      </View>
    );
  }

  if (!selectedChapter) return <View style={styles.root}><EmptyState title="Chưa có chương xuất bản" /><Pressable accessibilityRole="button" accessibilityLabel="Quay lại trang truyện" onPress={exitReader}><Text style={{ textAlign: 'center', color: '#8F1D3F' }}>Quay lại</Text></Pressable></View>;

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {!dark ? <XianxiaBackdrop opacity={settings.theme === 'paper' ? .16 : .07} /> : null}
      {sync.error ? <Text style={{ color: '#A12B48', padding: 8 }}>{sync.error}</Text> : null}
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView
        ref={scrollRef}
        onLayout={(event) => { textBounds.current.viewport = event.nativeEvent.layout.height; restoreReaderPosition(); }}
        onScroll={onScroll}
        onContentSizeChange={onReaderContentSizeChange}
        onScrollBeginDrag={() => {
          if (autoScrolling) {
            setAutoScrolling(false);
            setControlsVisible(true);
          }
        }}
        scrollEventThrottle={120}
        scrollEnabled={settings.mode !== 'page'}
        {...(settings.mode === 'page' && !settings.horizontalChapterGestures ? pagePanResponder.panHandlers : {})}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.readingPage, { paddingHorizontal: settings.padding, paddingTop: insets.top + 72, paddingBottom: insets.bottom + 105 }]}
        style={{ backgroundColor: dark ? palette.bg : settings.theme === 'paper' ? 'rgba(244,235,216,.88)' : 'rgba(255,255,255,.94)' }}
      >
        <View ref={chapterGestures.bindWeb} testID="reader-gesture-content" {...chapterGestures.handlers}
          onLayout={(event) => { textBounds.current.bottom = event.nativeEvent.layout.y + event.nativeEvent.layout.height; restoreReaderPosition(); }}>
        <Pressable onPress={() => setControlsVisible((value) => !value)}>
          {settings.mode === 'page' ? <View style={[styles.pageModeBadge, dark && styles.pageModeBadgeDark]}><Ionicons name="albums-outline" size={14} color={dark ? xianxia.goldSoft : xianxia.jadeDeep} /><Text style={[styles.pageModeText, dark && styles.pageModeTextDark]}>Lật trang · {pageIndex + 1}/{pagedContent.length}</Text></View> : null}
          {settings.mode !== 'page' || pageIndex === 0 ? <>
            <Text style={[styles.bookKicker, { color: palette.muted }]}>{book.title.toUpperCase()}</Text>
            <Text style={[styles.chapterNumber, { color: palette.text }]}>Chương {chapterNumber}</Text>
            {chapterDisplayTitle ? <Text style={[styles.chapterTitle, { color: palette.text }]}>{chapterDisplayTitle}</Text> : null}
            {dark ? <View style={[styles.rule, { backgroundColor: palette.muted }]} /> : <ArtDivider />}
          </> : null}
          {paragraphElements}
        </Pressable>
        </View>
        <Pressable onPress={() => setControlsVisible((value) => !value)}>
          {settings.mode === 'page' ? <View style={[styles.pagePager, { borderColor: dark ? '#4C494B' : xianxia.line }]}>
            <Pressable disabled={pageIndex === 0} onPress={() => goReaderPage(pageIndex - 1)} style={[styles.pageButton, pageIndex === 0 && styles.disabled]}><Ionicons name="chevron-back" size={17} color={palette.text} /><Text style={[styles.pageButtonText, { color: palette.text }]}>Trang trước</Text></Pressable>
            <Text style={[styles.pageCount, { color: palette.muted }]}>{pageIndex + 1} / {pagedContent.length}</Text>
            <Pressable disabled={pageIndex >= pagedContent.length - 1} onPress={() => goReaderPage(pageIndex + 1)} style={[styles.pageButton, styles.pageButtonRight, pageIndex >= pagedContent.length - 1 && styles.disabled]}><Text style={[styles.pageButtonText, { color: palette.text }]}>Trang sau</Text><Ionicons name="chevron-forward" size={17} color={palette.text} /></Pressable>
          </View> : null}
          {settings.mode !== 'page' || pageIndex === pagedContent.length - 1 ? <Text style={[styles.endMark, { color: palette.muted }]}>— Hết chương {chapterNumber} —</Text> : null}
        </Pressable>

        <AdBanner dark={dark} />

        <View style={[styles.chapterNav, { borderColor: dark ? '#4C494B' : '#D9CCC4' }]}>
          <Pressable disabled={previousNumber === undefined} onPress={() => goChapter(previousNumber ?? chapterNumber)} style={[styles.navButton, previousNumber === undefined && styles.disabled]}><Ionicons name="chevron-back" size={16} color={palette.text} /><Text style={[styles.navText, { color: palette.text }]}>Chương trước</Text></Pressable>
          <Pressable onPress={() => setSheet('chapters')} style={styles.navCenter}><Ionicons name="list" size={19} color="#9C3153" /><Text style={styles.navCenterText}>Danh sách</Text></Pressable>
          <Pressable disabled={nextNumber === undefined} onPress={() => goChapter(nextNumber ?? chapterNumber)} style={[styles.navButton, styles.navRight, nextNumber === undefined && styles.disabled]}><Text style={[styles.navText, { color: palette.text }]}>Chương sau</Text><Ionicons name="chevron-forward" size={16} color={palette.text} /></Pressable>
        </View>
        <View style={styles.discussion}>
          {offlineReading ? <View style={styles.offlineDiscussion}>
            <Ionicons name="cloud-offline-outline" size={20} color="#8F1D3F" />
            <Text style={styles.offlineDiscussionText}>Bình luận sẽ tải lại khi có mạng. Nội dung chương này đang được đọc từ bản lưu trên thiết bị.</Text>
          </View> : <Comments bookId={book.id} chapterId={chapter.id} />}
        </View>
      </ScrollView>

      {chapterGestures.feedback ? <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 76, alignSelf: 'center',
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: palette.bar, borderWidth: 1,
        borderColor: chapterGestures.feedback.armed ? xianxia.jadeDeep : palette.muted }}>
        <Text accessibilityLiveRegion="polite" style={{ color: palette.text, fontSize: 12 }}>
          {chapterGestures.feedback.armed ? 'Thả để chuyển chương' : chapterGestures.feedback.direction === 'next' ? 'Kéo để sang chương tiếp' : 'Kéo để về chương trước'}
        </Text>
      </View> : null}

      {autoScrolling ? <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tạm dừng tự động cuộn"
        onPress={() => toggleAutoScroll(false)}
        style={[styles.autoScrollPill, { bottom: insets.bottom + 18 }]}
      >
        <Ionicons name="pause" size={15} color="#FFFDF8" />
        <Text style={styles.autoScrollPillText}>Tự cuộn · {['', 'Chậm', 'Vừa', 'Nhanh', 'Rất nhanh'][settings.autoScrollSpeed ?? 2]}</Text>
      </Pressable> : null}

      {!controlsVisible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại trang truyện"
          onPress={exitReader}
          style={[
            styles.floatingBack,
            {
              top: insets.top + 10,
              backgroundColor: dark ? 'rgba(18,18,18,0.92)' : 'rgba(255,253,252,0.94)',
              borderColor: dark ? '#4B4548' : '#E0D4CD',
            },
          ]}
        >
          <Ionicons name="arrow-back" size={20} color={palette.text} />
          <Text style={[styles.floatingBackText, { color: palette.text }]}>Quay lại</Text>
        </Pressable>
      ) : null}

      {controlsVisible ? (
        <>
          <View style={[styles.topbar, { paddingTop: insets.top, height: 57 + insets.top, backgroundColor: palette.bar, borderBottomColor: dark ? '#3F3B3D' : '#DFD2CB' }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Quay lại trang truyện" style={styles.topIcon} onPress={exitReader}><Ionicons name="arrow-back" size={22} color={palette.text} /></Pressable>
            <View style={styles.topCopy}><Text numberOfLines={1} style={[styles.topTitle, { color: palette.text }]}>{book.title}</Text><Text style={[styles.topSubtitle, { color: palette.muted }]}>{offlineReading ? 'Offline · ' : ''}Chương {chapterNumber} · {readingProgress}%</Text></View>
            <Pressable style={styles.topIcon} onPress={toggleBookmark}><Ionicons name={bookmark?.chapter === chapterNumber ? 'bookmark' : 'bookmark-outline'} size={22} color={bookmark?.chapter === chapterNumber ? xianxia.cinnabar : palette.text} /></Pressable>
            <View style={[styles.readingProgressTrack, { backgroundColor: dark ? '#3F4541' : '#E4DACB' }]}><View style={[styles.readingProgressFill, { width: `${readingProgress}%` }]} /></View>
          </View>
          <View style={styles.toolbar}><ReaderToolbar onSelect={chooseTool} dark={dark} /></View>
        </>
      ) : null}

      <ShareQuoteSheet
        visible={Boolean(quoteToShare)}
        quote={quoteToShare ?? ''}
        bookTitle={book.title}
        authorName={book.author}
        chapterNumber={chapterNumber}
        chapterTitle={chapterDisplayTitle}
        sharing={sharingQuote}
        notice={shareNotice}
        onShare={() => void shareCurrentQuote()}
        onClose={() => { setQuoteToShare(null); setShareNotice(''); }}
      />
      <ChapterSheet visible={sheet === 'chapters'} onClose={() => setSheet(null)} chapters={filteredChapters} query={chapterSearch} onQuery={setChapterSearch} onSelect={goChapter} current={chapterNumber} />
      <SettingsSheet
        visible={sheet === 'settings'}
        onClose={() => setSheet(null)}
        settings={settings}
        onChange={setSettings}
        autoScrolling={autoScrolling}
        onToggleAutoScroll={toggleAutoScroll}
      />
      {audioInitialized || sheet === 'audio' ? <AudioSheet
        visible={sheet === 'audio'}
        onClose={() => setSheet(null)}
        chapterKey={`${book.id}:${chapterNumber}`}
        chapterTitle={chapterDisplayTitle ? `Chương ${chapterNumber} · ${chapterDisplayTitle}` : `Chương ${chapterNumber}`}
        chapterText={audioText}
        initialProgress={readingProgress}
        onProgress={setReadingProgress}
        resumeRequested={resumeAudio.current}
        onResumeConsumed={consumeAudioResume}
        onPrevious={(resume) => goChapter(previousNumber ?? chapterNumber, resume)}
        onNext={(resume) => goChapter(nextNumber ?? chapterNumber, resume)}
        canPrevious={previousNumber !== undefined}
        canNext={nextNumber !== undefined}
      /> : null}
      <MoreSheet
        visible={sheet === 'more'}
        onClose={() => setSheet(null)}
        bookmark={bookmark}
        chapter={chapterNumber}
        onBookmark={toggleBookmark}
        onComments={() => { setSheet(null); requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })); }}
        onShareQuote={shareNearReadingPosition}
        canGiftAuthor={book.authorUserId !== user?.id}
        onGiftAuthor={() => {
          setSheet(null);
          if (!user) router.push('/auth/login');
          else setGiftOpen(true);
        }}
      />
      {user && book.authorUserId !== user.id ? <AuthorGiftSheet
        visible={giftOpen}
        onClose={() => setGiftOpen(false)}
        bookId={book.id}
        bookTitle={book.title}
        authorName={book.author}
        userId={user.id}
        onOpenWallet={() => { setGiftOpen(false); router.push('/wallet/store'); }}
      /> : null}
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

function SettingsSheet({
  visible,
  onClose,
  settings,
  onChange,
  autoScrolling,
  onToggleAutoScroll,
}: {
  visible: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onChange: (value: ReaderSettings) => void;
  autoScrolling: boolean;
  onToggleAutoScroll: (enabled: boolean) => void;
}) {
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
    <Segment options={[['scroll', 'Cuộn dọc'], ['page', 'Lật trang']]} value={settings.mode} onChange={(value) => update('mode', value as ReaderMode)} />

    <View style={sheetStyles.readerOptionRow}>
      <View style={{ flex: 1 }}><Text style={sheetStyles.readerOptionTitle}>Vuốt ngang chuyển chương</Text>
        <Text style={sheetStyles.readerOptionBody}>Vuốt trái sang chương sau, vuốt phải về chương trước. Khi bật trong chế độ lật trang, dùng nút để lật từng trang.</Text></View>
      <Switch accessibilityLabel="Vuốt ngang chuyển chương" value={Boolean(settings.horizontalChapterGestures)} onValueChange={(value) => update('horizontalChapterGestures', value)} trackColor={{ false: '#D7CFC1', true: '#79988B' }} />
    </View>
    <View style={sheetStyles.readerOptionRow}>
      <View style={{ flex: 1 }}><Text style={sheetStyles.readerOptionTitle}>Kéo vượt đầu/cuối chuyển chương</Text>
        <Text style={sheetStyles.readerOptionBody}>Trong chế độ cuộn, bắt đầu kéo khi đã ở đầu hoặc cuối nội dung, rồi thả để chuyển.</Text></View>
      <Switch accessibilityLabel="Kéo vượt đầu/cuối chuyển chương" value={Boolean(settings.boundaryChapterGestures)} onValueChange={(value) => update('boundaryChapterGestures', value)} trackColor={{ false: '#D7CFC1', true: '#79988B' }} />
    </View>
    <SettingLabel title="Độ nhạy cử chỉ" />
    <Segment options={[['low', 'Thấp'], ['medium', 'Vừa'], ['high', 'Cao']]} value={settings.gestureSensitivity ?? 'medium'} onChange={(value) => update('gestureSensitivity', value as NonNullable<ReaderSettings['gestureSensitivity']>)} />
    <SettingLabel title="Khi về chương trước" />
    <Segment options={[['restore', 'Vị trí đã đọc'], ['end', 'Cuối chương']]} value={settings.previousChapterLanding ?? 'restore'} onChange={(value) => update('previousChapterLanding', value as NonNullable<ReaderSettings['previousChapterLanding']>)} />

    <View style={[sheetStyles.readerOptionRow, settings.mode !== 'scroll' && sheetStyles.readerOptionDisabled]}>
      <View style={{ flex: 1 }}>
        <Text style={sheetStyles.readerOptionTitle}>Tự động cuộn</Text>
        <Text style={sheetStyles.readerOptionBody}>{settings.mode === 'scroll' ? 'Cuộn nội dung liên tục; chạm kéo bằng tay sẽ tự tạm dừng.' : 'Chuyển sang chế độ Cuộn dọc để sử dụng.'}</Text>
      </View>
      <Switch disabled={settings.mode !== 'scroll'} value={autoScrolling && settings.mode === 'scroll'} onValueChange={onToggleAutoScroll} trackColor={{ false: '#D7CFC1', true: '#79988B' }} thumbColor={autoScrolling ? xianxia.jadeDeep : '#FFF8EA'} />
    </View>
    <SettingLabel title="Tốc độ tự cuộn" />
    <Segment options={[['1', 'Chậm'], ['2', 'Vừa'], ['3', 'Nhanh'], ['4', 'Rất nhanh']]} value={String(settings.autoScrollSpeed ?? 2)} onChange={(value) => update('autoScrollSpeed', Number(value) as ReaderAutoScrollSpeed)} />

    <View style={sheetStyles.readerOptionRow}>
      <View style={{ flex: 1 }}>
        <Text style={sheetStyles.readerOptionTitle}>Giữ màn hình sáng</Text>
        <Text style={sheetStyles.readerOptionBody}>Ngăn thiết bị tự tắt màn hình khi đang đọc. Tắt nếu muốn tiết kiệm pin.</Text>
      </View>
      <Switch value={Boolean(settings.keepAwake)} onValueChange={(value) => update('keepAwake', value)} trackColor={{ false: '#D7CFC1', true: '#79988B' }} thumbColor={settings.keepAwake ? xianxia.jadeDeep : '#FFF8EA'} />
    </View>
  </BottomSheet>;
}

function SettingLabel({ title, value }: { title: string; value?: string }) { return <View style={sheetStyles.labelRow}><Text style={sheetStyles.label}>{title}</Text>{value ? <Text style={sheetStyles.labelValue}>{value}</Text> : null}</View>; }

function Segment({ options, value, onChange }: { options: readonly (readonly [string, string])[]; value: string; onChange: (value: string) => void }) {
  return <View style={sheetStyles.segment}>{options.map(([id, label]) => <Pressable key={id} onPress={() => onChange(id)} style={[sheetStyles.segmentItem, value === id && sheetStyles.segmentActive]}><Text style={[sheetStyles.segmentText, value === id && sheetStyles.segmentTextActive]}>{label}</Text></Pressable>)}</View>;
}

function AudioSheet({
  visible,
  onClose,
  chapterKey,
  chapterTitle,
  chapterText,
  initialProgress,
  onProgress,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  resumeRequested,
  onResumeConsumed,
}: {
  visible: boolean;
  onClose: () => void;
  chapterKey: string;
  chapterTitle: string;
  chapterText: string;
  initialProgress: number;
  onProgress: (percent: number) => void;
  onPrevious: (resume: boolean) => void;
  onNext: (resume: boolean) => void;
  canPrevious: boolean;
  canNext: boolean;
  resumeRequested: boolean;
  onResumeConsumed: () => void;
}) {
  const playbackEndOptions = useRef<{ sleepTimer: SleepTimer; autoNext: boolean }>({ sleepTimer: 'Tắt', autoNext: true });
  const [trackWidth, setTrackWidth] = useState(1);
  const player = useTtsPlayer({
    chapterKey,
    text: chapterText,
    initialProgressPercent: initialProgress,
    onProgress,
    onEnded: () => {
      if (playbackEndOptions.current.sleepTimer === 'Hết chương') return;
      if (playbackEndOptions.current.autoNext && canNext) {
        onNext(true);
      }
    },
  });
  playbackEndOptions.current = { sleepTimer: player.sleepTimer, autoNext: player.autoNext };

  useEffect(() => {
    if (!resumeRequested || player.preparing || !player.hasSpeech) return;
    const timeout = setTimeout(() => { onResumeConsumed(); player.playFromStart(); }, 180);
    return () => clearTimeout(timeout);
  }, [chapterKey, resumeRequested, player.preparing, player.hasSpeech, player.playFromStart, onResumeConsumed]);

  const switchChapter = (direction: 'previous' | 'next') => {
    const resume = player.playing;
    void player.stop(false);
    if (direction === 'previous') onPrevious(resume);
    else onNext(resume);
  };

  return <BottomSheet visible={visible} title="Nghe chương" onClose={onClose} scroll>
    <View style={[audioStyles.art, player.playing && audioStyles.artPlaying]}>
      <Ionicons name="headset" size={35} color={xianxia.goldSoft} />
      <View style={audioStyles.wave}>
        {[10, 25, 16, 28, 10].map((height, index) => <View key={index} style={[audioStyles.waveLine, { height: player.playing ? height : 8 }]} />)}
      </View>
    </View>
    <Text style={audioStyles.title}>{chapterTitle}</Text>
    <Text style={audioStyles.sub}>TTS hệ thống · {player.voiceName}</Text>
    {player.voiceCount === 0 ? <Text style={audioStyles.voiceHint}>Chưa phát hiện gói giọng tiếng Việt trên thiết bị. CHƯƠNG sẽ yêu cầu hệ điều hành dùng giọng vi-VN mặc định và tuyệt đối không chọn giọng tiếng Anh thay thế.</Text> : !player.hasDistinctGenderVoices ? <Text style={audioStyles.voiceHint}>Thiết bị đã có giọng tiếng Việt nhưng chưa cung cấp đủ hai giọng Nam/Nữ riêng biệt. CHƯƠNG vẫn giữ tiếng Việt và tạo khác biệt Nam/Nữ bằng cao độ; cài thêm voice pack tiếng Việt để có hai giọng tự nhiên riêng biệt.</Text> : <Text style={audioStyles.voiceHint}>Đã phát hiện hai giọng tiếng Việt khác nhau cho lựa chọn Nam/Nữ.</Text>}
    {player.error ? <Text style={audioStyles.error}>{player.error}</Text> : null}
    {player.sleepExpired ? <Text style={audioStyles.sleepNotice}>Hẹn giờ ngủ đã dừng giọng đọc.</Text> : null}

    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel="Tiến độ nghe"
      style={audioStyles.track}
      onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
      onPress={(event) => player.seekToPercent(event.nativeEvent.locationX / trackWidth * 100)}
    >
      <View style={[audioStyles.fill, { width: `${player.progressPercent}%` }]}><View style={audioStyles.thumb} /></View>
    </Pressable>
    <View style={audioStyles.time}><Text style={audioStyles.timeText}>{player.formattedCurrent}</Text><Text style={audioStyles.timeText}>{player.formattedTotal}</Text></View>

    <View style={audioStyles.controls}>
      <Pressable accessibilityLabel="Chương trước" disabled={!canPrevious} onPress={() => switchChapter('previous')} style={!canPrevious && styles.disabled}><Ionicons name="play-skip-back" size={23} color={xianxia.inkSoft} /></Pressable>
      <Pressable accessibilityLabel="Lùi khoảng 15 giây" onPress={() => player.seekBySeconds(-15)}><View><Ionicons name="refresh-outline" size={27} color={xianxia.inkSoft} /><Text style={audioStyles.seconds}>15</Text></View></Pressable>
      <Pressable accessibilityLabel={player.playing ? 'Tạm dừng' : 'Phát giọng đọc'} disabled={!player.hasSpeech} style={[audioStyles.play, !player.hasSpeech && styles.disabled]} onPress={player.toggle}><Ionicons name={player.playing ? 'pause' : 'play'} size={29} color="#FFFFFF" /></Pressable>
      <Pressable accessibilityLabel="Tiến khoảng 15 giây" onPress={() => player.seekBySeconds(15)}><View><Ionicons name="refresh-outline" size={27} color={xianxia.inkSoft} style={{ transform: [{ scaleX: -1 }] }} /><Text style={audioStyles.seconds}>15</Text></View></Pressable>
      <Pressable accessibilityLabel="Chương sau" disabled={!canNext} onPress={() => switchChapter('next')} style={!canNext && styles.disabled}><Ionicons name="play-skip-forward" size={23} color={xianxia.inkSoft} /></Pressable>
    </View>
    <Text style={audioStyles.pauseHint}>{player.paused ? 'Đã tạm dừng · phát lại sẽ tiếp tục gần vị trí hiện tại.' : 'Giọng đọc chạy trực tiếp trên thiết bị, không cần API trả phí.'}</Text>

    <Text style={audioStyles.optionLabel}>Tốc độ</Text>
    <View style={audioStyles.options}>{TTS_SPEEDS.map((item) => <Pressable key={item} onPress={() => player.setSpeed(item)} style={[audioStyles.option, player.speed === item && audioStyles.optionActive]}><Text style={[audioStyles.optionText, player.speed === item && audioStyles.optionTextActive]}>{item}x</Text></Pressable>)}</View>

    <Text style={audioStyles.optionLabel}>Giọng đọc tiếng Việt</Text>
    <Segment options={TTS_VOICES.map((item) => [item, item] as const)} value={player.voice} onChange={(value) => player.setVoice(value as TtsVoice)} />

    <View style={audioStyles.autoNextRow}>
      <View style={{ flex: 1 }}><Text style={audioStyles.autoNextTitle}>Tự động sang chương sau</Text><Text style={audioStyles.autoNextBody}>Khi đọc hết chương, CHƯƠNG tiếp tục phát chương kế tiếp nếu có.</Text></View>
      <Switch value={player.autoNext} onValueChange={player.setAutoNext} trackColor={{ false: '#D8CEC1', true: '#79988B' }} thumbColor={player.autoNext ? xianxia.jadeDeep : '#FFF8EA'} />
    </View>

    <Text style={audioStyles.optionLabel}>Hẹn giờ ngủ {player.sleepTimer !== 'Tắt' ? `· ${player.sleepTimer}` : ''}</Text>
    <View style={audioStyles.options}>{SLEEP_TIMERS.map((item) => <Pressable key={item} onPress={() => player.setSleepTimer(player.sleepTimer === item ? 'Tắt' : item)} style={[audioStyles.timerChoice, player.sleepTimer === item && audioStyles.optionActive]}><Text style={[audioStyles.timerChoiceText, player.sleepTimer === item && audioStyles.optionTextActive]}>{item}</Text></Pressable>)}</View>
  </BottomSheet>;
}

function ShareQuoteSheet({
  visible,
  quote,
  bookTitle,
  authorName,
  chapterNumber,
  chapterTitle,
  sharing,
  notice,
  onShare,
  onClose,
}: {
  visible: boolean;
  quote: string;
  bookTitle: string;
  authorName?: string | null;
  chapterNumber: number;
  chapterTitle?: string | null;
  sharing: boolean;
  notice: string;
  onShare: () => void;
  onClose: () => void;
}) {
  const preview = quote.replace(/\s+/g, ' ').trim();
  const clipped = preview.length > 420 ? preview.slice(0, 417).trimEnd() + '…' : preview;
  return <BottomSheet visible={visible} title="Chia sẻ trích đoạn" onClose={onClose} scroll>
    <View style={quoteStyles.card}>
      <View style={quoteStyles.brandRow}>
        <View style={quoteStyles.brandSeal}><Text style={quoteStyles.brandSealText}>C</Text></View>
        <Text style={quoteStyles.brand}>CHƯƠNG</Text>
      </View>
      <Text style={quoteStyles.quote}>“{clipped}”</Text>
      <View style={quoteStyles.rule} />
      <Text style={quoteStyles.book}>{bookTitle}</Text>
      <Text style={quoteStyles.meta}>Chương {chapterNumber}{chapterTitle?.trim() ? ' · ' + chapterTitle.trim() : ''}</Text>
      {authorName?.trim() ? <Text style={quoteStyles.author}>Tác giả · {authorName.trim()}</Text> : null}
    </View>
    <Text style={quoteStyles.hint}>Nhấn giữ bất kỳ đoạn văn nào trong Reader để chọn chính xác trích đoạn muốn chia sẻ. Liên kết mở thẳng về chương hiện tại.</Text>
    {notice ? <Text style={quoteStyles.notice}>{notice}</Text> : null}
    <Pressable disabled={sharing || !clipped} onPress={onShare} style={[quoteStyles.shareButton, (sharing || !clipped) && styles.disabled]}>
      <Ionicons name="share-social-outline" size={18} color="#FFFDF8" />
      <Text style={quoteStyles.shareButtonText}>{sharing ? 'Đang mở chia sẻ…' : 'Chia sẻ trích đoạn'}</Text>
    </Pressable>
  </BottomSheet>;
}

function MoreSheet({
  visible,
  onClose,
  bookmark,
  chapter,
  onBookmark,
  onComments,
  onShareQuote,
  onGiftAuthor,
  canGiftAuthor,
}: {
  visible: boolean;
  onClose: () => void;
  bookmark: Bookmark | null;
  chapter: number;
  onBookmark: () => void;
  onComments: () => void;
  onShareQuote: () => void;
  onGiftAuthor: () => void;
  canGiftAuthor: boolean;
}) {
  return <BottomSheet visible={visible} title="Thêm" onClose={onClose}>
    <Pressable style={sheetStyles.moreRow} onPress={onBookmark}><Ionicons name={bookmark?.chapter === chapter ? 'bookmark' : 'bookmark-outline'} size={21} color="#8F1D3F" /><View><Text style={sheetStyles.aiTitle}>{bookmark?.chapter === chapter ? 'Bỏ dấu trang' : 'Lưu vị trí đọc'}</Text><Text style={sheetStyles.aiDetail}>{bookmark ? `Đã lưu Chương ${bookmark.chapter} · ${bookmark.progress}%` : 'Chưa có dấu trang'}</Text></View></Pressable>
    <Pressable style={sheetStyles.moreRow} onPress={onComments}><Ionicons name="chatbubble-outline" size={21} color="#8F1D3F" /><View><Text style={sheetStyles.aiTitle}>Bình luận chương</Text><Text style={sheetStyles.aiDetail}>Tham gia thảo luận ở cuối chương</Text></View></Pressable>
    <Pressable style={sheetStyles.moreRow} onPress={onShareQuote}><Ionicons name="share-social-outline" size={21} color="#8F1D3F" /><View><Text style={sheetStyles.aiTitle}>Chia sẻ trích đoạn</Text><Text style={sheetStyles.aiDetail}>Chọn đoạn gần vị trí đang đọc · hoặc nhấn giữ đoạn bất kỳ</Text></View></Pressable>
    {canGiftAuthor ? <Pressable style={sheetStyles.moreRow} onPress={onGiftAuthor}><Ionicons name="gift-outline" size={21} color="#8F1D3F" /><View><Text style={sheetStyles.aiTitle}>Tặng quà tác giả</Text><Text style={sheetStyles.aiDetail}>Ủng hộ tác giả bằng Thượng Phẩm Linh Thạch</Text></View></Pressable> : null}
    <Pressable style={sheetStyles.moreRow} onPress={() => Alert.alert('Báo lỗi nội dung', 'Đã ghi nhận. Tính năng gửi báo cáo sẽ kết nối với CHƯƠNG backend ở giai đoạn sau.')}><Ionicons name="flag-outline" size={21} color="#8F1D3F" /><View><Text style={sheetStyles.aiTitle}>Báo lỗi nội dung</Text><Text style={sheetStyles.aiDetail}>Gửi ghi chú cho ban biên tập</Text></View></Pressable>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  paywallRoot: { backgroundColor: xianxia.paper, paddingHorizontal: 16 },
  paywallTop: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paywallTopTitle: { flex: 1, color: xianxia.ink, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  paywallCard: { width: '100%', maxWidth: 520, alignSelf: 'center', marginTop: 38, backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.goldSoft, borderRadius: 22, padding: 24, alignItems: 'center', shadowColor: '#3C332C', shadowOpacity: .10, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  lockCircle: { width: 62, height: 62, borderRadius: 19, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', alignItems: 'center', justifyContent: 'center' },
  paywallKicker: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: 16 },
  paywallTitle: { color: '#251C20', fontSize: 20, lineHeight: 27, fontWeight: '900', textAlign: 'center', marginTop: 7 },
  paywallBody: { color: '#756A6E', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 10 },
  pricePill: { marginTop: 18, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  priceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  earlyAccessPaywall: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900', marginTop: 9, textAlign: 'center' },
  balanceText: { color: '#756A6E', fontSize: 10, marginTop: 13 },
  unlockError: { color: '#A12B48', fontSize: 10, textAlign: 'center', marginTop: 10 },
  unlockButton: { width: '100%', minHeight: 52, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 18 },
  unlockButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  unlockDisabled: { opacity: .55 },
  paywallSafety: { color: '#95898D', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 12 },
  readingPage: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  pageModeBadge: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginBottom: 18 },
  pageModeBadgeDark: { backgroundColor: '#263630', borderColor: '#4D5D56' }, pageModeText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900' }, pageModeTextDark: { color: xianxia.goldSoft },
  pagePager: { minHeight: 56, marginTop: 8, marginBottom: 12, borderTopWidth: 1, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  pageButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4 }, pageButtonRight: { justifyContent: 'flex-end' },
  pageButtonText: { fontSize: 10, fontWeight: '900' }, pageCount: { minWidth: 58, textAlign: 'center', fontSize: 9, fontWeight: '800' },
  bookKicker: { fontSize: 10, letterSpacing: 1.7, fontWeight: '900', textAlign: 'center' },
  chapterNumber: { fontSize: 27, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  chapterTitle: { fontSize: 19, lineHeight: 25, fontWeight: '600', textAlign: 'center', marginTop: 5 },
  rule: { width: 30, height: 1, alignSelf: 'center', marginTop: 23, marginBottom: 26, opacity: .5 },
  paragraph: { marginBottom: 20, textAlign: 'left' },
  endMark: { textAlign: 'center', fontSize: 11, fontWeight: '700', marginTop: 17, marginBottom: 35 },
  chapterNav: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 18, flexDirection: 'row', alignItems: 'center' },
  navButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }, navRight: { justifyContent: 'flex-end' }, disabled: { opacity: .3 },
  navText: { fontSize: 11, fontWeight: '800' }, navCenter: { alignItems: 'center', paddingHorizontal: 8 }, navCenterText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900', marginTop: 3 },
  discussion: { marginTop: 28 }, discussionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }, discussionHeading: { fontSize: 16, fontWeight: '900' },
  miniComment: { flexDirection: 'row', gap: 9, paddingVertical: 12 }, miniAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E7D7DC', alignItems: 'center', justifyContent: 'center' }, miniAvatarText: { color: '#852545', fontSize: 9, fontWeight: '900' }, miniName: { fontSize: 11, fontWeight: '900' }, miniBody: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  topbar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 20 },
  readingProgressTrack: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2 },
  readingProgressFill: { height: 2, backgroundColor: xianxia.jadeDeep },
  topIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, topCopy: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40 }, topTitle: { fontSize: 13, fontWeight: '900', maxWidth: '95%' }, topSubtitle: { fontSize: 9, marginTop: 2 },
  floatingBack: { position: 'absolute', left: 12, zIndex: 30, minWidth: 88, height: 40, borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, elevation: 6, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  floatingBackText: { fontSize: 10, fontWeight: '900' },
  offlineDiscussion: { marginTop: 8, borderRadius: 14, backgroundColor: '#F0E1E5', padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  offlineDiscussionText: { flex: 1, color: '#6F6167', fontSize: 9, lineHeight: 14 },
  autoScrollPill: { position: 'absolute', right: 14, zIndex: 35, minHeight: 38, borderRadius: 20, paddingHorizontal: 12, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#000', shadowOpacity: .14, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  autoScrollPillText: { color: '#FFFDF8', fontSize: 9, fontWeight: '900' },
  toolbar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20 }
});

const sheetStyles = StyleSheet.create({
  search: { height: 45, borderRadius: 13, backgroundColor: '#F7F0EC', borderWidth: 1, borderColor: '#E2D6D0', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 8 }, input: { flex: 1, fontSize: 13, color: '#31272B' }, hint: { color: '#8A7D82', fontSize: 10, marginVertical: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 8 }, label: { color: '#3A3034', fontSize: 12, fontWeight: '900' }, labelValue: { color: '#8F1D3F', fontSize: 11, fontWeight: '800' },
  adjust: { flexDirection: 'row', alignItems: 'center', gap: 12 }, adjustButton: { width: 48, height: 42, borderRadius: 11, borderWidth: 1, borderColor: '#DCCFC9', alignItems: 'center', justifyContent: 'center' }, smallA: { color: '#473B40', fontSize: 13, fontWeight: '900' }, bigA: { color: '#473B40', fontSize: 18, fontWeight: '900' }, adjustTrack: { flex: 1, height: 4, borderRadius: 3, backgroundColor: '#E3D8D2' }, adjustFill: { height: 4, borderRadius: 3, backgroundColor: '#8F1D3F' },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: '#F1E9E5' }, segmentItem: { flex: 1, minHeight: 36, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, segmentActive: { backgroundColor: '#FFFFFF' }, segmentText: { color: '#74686D', fontSize: 10, fontWeight: '700', textAlign: 'center' }, segmentTextActive: { color: '#8F1D3F', fontWeight: '900' },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between' }, themeOption: { alignItems: 'center', minWidth: 55 }, themeCircle: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#D8CBC5', alignItems: 'center', justifyContent: 'center' }, themeActive: { borderWidth: 3, borderColor: '#A52C52' }, themeLabel: { color: '#6E6267', fontSize: 9, fontWeight: '700', marginTop: 5 },
  paddingRow: { flexDirection: 'row', alignItems: 'center', gap: 14 }, paddingDemo: { flex: 1, height: 36, borderWidth: 1, borderColor: '#E1D5CF', alignItems: 'center', justifyContent: 'center', gap: 5 },
  aiNotice: { color: '#756A6E', fontSize: 11, lineHeight: 17, backgroundColor: '#F7EFF1', padding: 11, borderLeftWidth: 3, borderLeftColor: '#8F1D3F', marginBottom: 5 }, aiRow: { flexDirection: 'row', alignItems: 'center', minHeight: 65, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2D6D0', gap: 11 }, aiIcon: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' }, aiTitle: { color: '#31272B', fontSize: 13, fontWeight: '900' }, aiDetail: { color: '#877A80', fontSize: 10, marginTop: 3 }, aiResult: { backgroundColor: '#F5EDEA', padding: 13, marginTop: 12, borderRadius: 12 }, aiResultTitle: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' }, aiResultText: { color: '#50454A', fontSize: 12, lineHeight: 18, marginTop: 5 },
  readerOptionRow: { minHeight: 68, marginTop: 14, padding: 11, borderRadius: 13, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C6D7CC', flexDirection: 'row', alignItems: 'center', gap: 10 },
  readerOptionDisabled: { opacity: .56 },
  readerOptionTitle: { color: '#31272B', fontSize: 11, fontWeight: '900' },
  readerOptionBody: { color: '#756A6E', fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  moreRow: { flexDirection: 'row', alignItems: 'center', minHeight: 65, gap: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1D5CF' }
});

const quoteStyles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, backgroundColor: '#27423B', borderWidth: 1, borderColor: xianxia.gold, shadowColor: '#2A2A25', shadowOpacity: .12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandSeal: { width: 28, height: 28, borderRadius: 9, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  brandSealText: { color: xianxia.goldSoft, fontSize: 12, fontWeight: '900' },
  brand: { color: xianxia.goldSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  quote: { color: '#FFFDF8', fontSize: 17, lineHeight: 27, fontWeight: '700', marginTop: 16 },
  rule: { width: 34, height: 1, backgroundColor: 'rgba(229,209,163,.72)', marginTop: 18, marginBottom: 13 },
  book: { color: '#FFF7E8', fontSize: 12, fontWeight: '900' },
  meta: { color: 'rgba(255,253,248,.80)', fontSize: 9, lineHeight: 14, marginTop: 4 },
  author: { color: xianxia.goldSoft, fontSize: 8.5, fontWeight: '800', marginTop: 6 },
  hint: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, marginTop: 12 },
  notice: { color: xianxia.jadeDeep, fontSize: 9, lineHeight: 13, marginTop: 10, fontWeight: '800' },
  shareButton: { minHeight: 48, borderRadius: 14, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareButtonText: { color: '#FFFDF8', fontSize: 10.5, fontWeight: '900' },
});

const audioStyles = StyleSheet.create({
  art: { width: 92, height: 92, borderRadius: 28, alignSelf: 'center', backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  artPlaying: { shadowColor: xianxia.gold, shadowOpacity: .25, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  wave: { position: 'absolute', bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 3 },
  waveLine: { width: 2.5, borderRadius: 2, backgroundColor: xianxia.goldSoft },
  title: { color: xianxia.ink, fontSize: 16, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  sub: { color: xianxia.jade, fontSize: 9.5, textAlign: 'center', marginTop: 4, fontWeight: '800' },
  voiceHint: { color: xianxia.muted, fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 5 },
  error: { color: xianxia.danger, backgroundColor: '#F5E5E1', borderRadius: 10, padding: 9, fontSize: 9, lineHeight: 13, marginTop: 9, textAlign: 'center' },
  sleepNotice: { color: '#47704D', backgroundColor: '#E8F3EC', borderRadius: 10, padding: 9, fontSize: 9, marginTop: 9, textAlign: 'center', fontWeight: '800' },
  track: { height: 18, justifyContent: 'center', marginTop: 17 },
  fill: { height: 5, backgroundColor: xianxia.jadeDeep, borderRadius: 3, alignItems: 'flex-end', justifyContent: 'center' },
  thumb: { width: 12, height: 12, borderRadius: 6, backgroundColor: xianxia.gold, borderWidth: 2, borderColor: '#FFF8EA' },
  time: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
  timeText: { color: xianxia.muted, fontSize: 9 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 10 },
  play: { width: 60, height: 60, borderRadius: 30, backgroundColor: xianxia.jadeDeep, borderWidth: 2, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  seconds: { position: 'absolute', top: 9, width: '100%', textAlign: 'center', color: xianxia.inkSoft, fontSize: 7, fontWeight: '900' },
  pauseHint: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, textAlign: 'center', marginTop: 8 },
  optionLabel: { color: xianxia.inkSoft, fontSize: 10, fontWeight: '900', marginTop: 17, marginBottom: 7 },
  options: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  option: { flex: 1, paddingHorizontal: 7, paddingVertical: 8, borderRadius: 10, backgroundColor: '#EEE7DB', borderWidth: 1, borderColor: xianxia.line, alignItems: 'center' },
  optionActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.gold },
  optionText: { color: xianxia.inkSoft, fontSize: 9, fontWeight: '800' },
  optionTextActive: { color: xianxia.goldSoft },
  autoNextRow: { minHeight: 64, marginTop: 16, borderRadius: 13, padding: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', flexDirection: 'row', alignItems: 'center', gap: 9 },
  autoNextTitle: { color: xianxia.ink, fontSize: 10.5, fontWeight: '900' },
  autoNextBody: { color: xianxia.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  timerChoice: { flex: 1, minHeight: 38, borderRadius: 10, backgroundColor: '#EEE7DB', borderWidth: 1, borderColor: xianxia.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  timerChoiceText: { color: xianxia.inkSoft, fontSize: 8, fontWeight: '800', textAlign: 'center' }
});
