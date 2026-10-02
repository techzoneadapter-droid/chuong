import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Comments } from '../../components/Comments';
import { BookCard } from '../../components/BookCard';
import { LoadingState, RetryState } from '../../components/States';
import { isSupabaseConfigured } from '../../lib/supabase';
import { BottomSheet } from '../../components/BottomSheet';
import { ChapterRow } from '../../components/ChapterRow';
import { SectionHeader } from '../../components/SectionHeader';
import { getBook as getDemoBook } from '../../data/books';
import { useAuth } from '../../contexts/AuthContext';
import { getBookById, getBooks } from '../../services/books';
import { getChaptersByBook } from '../../services/chapters';
import { getFollowState, getLibrary, getReadingProgress, removeFromLibrary, setFollowState, setLibraryStatus } from '../../services/library';
import { Book, ReadingProgress } from '../../types';

type DownloadOption = 'Chương hiện tại' | '20 chương tiếp' | 'Toàn bộ';

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
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState<string | null>(null);

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
        const [library, savedProgress, authorFollow, bookFollow, catalogResult] = await Promise.all([
          getLibrary(user?.id), getReadingProgress(hydrated.id, user?.id),
          hydrated.authorId || result.mode === 'demo' ? getFollowState('author', hydrated.authorId ?? hydrated.author, user?.id) : false,
          getFollowState('book', hydrated.id, user?.id), getBooks()
        ]);
        if (!active) return;
        setInLibrary(library.some((entry) => entry.bookId === hydrated.id)); setProgress(savedProgress); setFollowing(authorFollow); setFollowingBook(bookFollow); setCatalog(catalogResult.data);
      } catch (error) { if (active) setLoadError(error instanceof Error ? error.message : 'Không thể tải dữ liệu mới.'); }
      finally { if (active) setLoading(false); }
    };
    load(); return () => { active = false; };
  }, [id, user?.id, reload]);

  const newest = useMemo(() => [...book.chapters].reverse().slice(0, 5), [book.chapters]);
  const similar = catalog.filter((item) => item.id !== book.id && (item.genre === book.genre || item.isVip === book.isVip)).slice(0, 5);

  const openReader = (chapter = currentChapter || 1) => book.totalChapters > 0 ? router.push({ pathname: '/reader/[bookId]', params: { bookId: book.id, chapter } }) : Alert.alert('Chưa có chương', 'Tác giả chưa xuất bản chương nào cho truyện này.');
  const shareBook = () => Share.share({ message: `${book.title} — ${book.author}\nĐọc trên CHƯƠNG: Mỗi chương, một thế giới.` });
  const download = (option: DownloadOption) => {
    setDownloading(option);
    setTimeout(() => {
      setDownloaded((value) => ({ ...value, [option]: true }));
      setDownloading(null);
    }, 900);
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

  if (loading) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải truyện…" /></SafeAreaView>;
  if (loadError) return <SafeAreaView style={styles.safe}><RetryState detail={loadError} onRetry={() => setReload((value) => value + 1)} /></SafeAreaView>;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <Pressable style={styles.topButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{book.title}</Text>
        <Pressable style={styles.topButton} onPress={shareBook}><Ionicons name="share-outline" size={21} color="#2D2327" /></Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        {loadError ? <Pressable onPress={() => setReload((value) => value + 1)}><Text style={styles.loadError}>{loadError} · Chạm để thử lại</Text></Pressable> : null}
        <View style={styles.hero}>
          {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={styles.cover} /> : <View style={[styles.cover, { backgroundColor: book.cover }]}> 
            <Text style={styles.coverBrand}>CHƯƠNG</Text>
            <Text style={styles.coverTitle}>{book.title}</Text>
            <Text style={styles.coverAuthor}>{book.author}</Text>
          </View>}
          <View style={styles.heroInfo}>
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

        <View style={styles.tags}>{book.tags.map((tag) => <Text style={styles.tag} key={tag}>{tag}</Text>)}</View>
        <Text numberOfLines={expanded ? undefined : 3} style={styles.description}>{book.description}</Text>
        <Pressable onPress={() => setExpanded((value) => !value)}><Text style={styles.more}>{expanded ? 'Thu gọn' : 'Xem thêm'}</Text></Pressable>

        <Pressable style={styles.primary} onPress={() => openReader()}>
          <Ionicons name="book" size={19} color="#FFFFFF" />
          <Text style={styles.primaryText}>{book.totalChapters === 0 ? 'Chưa có chương' : progress || book.progress > 0 ? `Đọc tiếp · Chương ${currentChapter}` : 'Đọc ngay'}</Text>
        </Pressable>
        <View style={styles.actions}>
          <Action icon={inLibrary ? 'checkmark' : 'add'} label={inLibrary ? 'Đã lưu' : 'Tủ sách'} onPress={toggleLibrary} active={inLibrary} />
          <Action icon={followingBook ? 'heart' : 'heart-outline'} label={followingBook ? 'Đang theo dõi' : 'Theo dõi truyện'} onPress={() => toggleFollow('book')} active={followingBook} />
          <Action icon="download-outline" label="Tải truyện" onPress={() => setDownloadOpen(true)} />
          <Action icon="share-outline" label="Chia sẻ" onPress={shareBook} />
        </View>

        <View style={styles.authorSection}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{book.author.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text></View>
          <View style={styles.authorCopy}><Text style={styles.authorName}>{book.author}</Text><Text style={styles.authorFollowers}>{book.authorFollowers} người theo dõi</Text></View>
          <Pressable style={[styles.follow, following && styles.following]} onPress={() => toggleFollow('author')}><Text style={[styles.followText, following && styles.followingText]}>{following ? 'Đang theo dõi' : 'Theo dõi tác giả'}</Text></Pressable>
        </View>

        <SectionHeader title="Danh sách chương" action={`${book.totalChapters} chương`} onPress={() => router.push({ pathname: '/book/[id]/chapters', params: { id: book.id } })} />
        <View style={styles.chapterList}>
          {newest.map((chapter) => <ChapterRow key={chapter.number} chapter={chapter} onPress={() => openReader(chapter.number)} />)}
        </View>
        <Pressable style={styles.outline} onPress={() => router.push({ pathname: '/book/[id]/chapters', params: { id: book.id } })}>
          <Text style={styles.outlineText}>Xem toàn bộ chương</Text><Ionicons name="arrow-forward" size={16} color="#8F1D3F" />
        </Pressable>

        <SectionHeader title="Đánh giá" action={`${book.rating} / 5`} />
        <View style={styles.ratingLine}><Text style={styles.ratingValue}>{book.rating}</Text><View><Text style={styles.stars}>★★★★★</Text><Text style={styles.ratingMeta}>{isSupabaseConfigured ? 'Chưa có thống kê đánh giá' : 'Từ 8.436 độc giả'}</Text></View></View>

        <Comments bookId={book.id} />

        <SectionHeader title="Truyện tương tự" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similar}>
          {similar.map((item) => <BookCard key={item.id} book={item} compact />)}
        </ScrollView>
      </ScrollView>

      <BottomSheet visible={downloadOpen} title="Tải truyện" onClose={() => setDownloadOpen(false)}>
        <Text style={styles.sheetNote}>Lưu nội dung từ CHƯƠNG để đọc khi không có mạng.</Text>
        {(['Chương hiện tại', '20 chương tiếp', 'Toàn bộ'] as DownloadOption[]).map((option, index) => (
          <Pressable key={option} style={styles.downloadRow} onPress={() => download(option)} disabled={downloading === option}>
            <View style={styles.downloadIcon}><Ionicons name={downloaded[option] ? 'checkmark' : 'download-outline'} size={18} color="#8F1D3F" /></View>
            <View style={{ flex: 1 }}><Text style={styles.downloadTitle}>{option}</Text><Text style={styles.downloadMeta}>{downloading === option ? `Đang tải · ${[1.8, 34, 286][index]} MB` : downloaded[option] ? `Đã tải · ${[1.8, 34, 286][index]} MB` : `Dung lượng · ${[1.8, 34, 286][index]} MB`}</Text></View>
            <Ionicons name="chevron-forward" size={17} color="#A6999E" />
          </Pressable>
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

function Metric({ value, label, icon }: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={styles.metric}><Ionicons name={icon} size={14} color="#8F1D3F" /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Action({ icon, label, onPress, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  return <Pressable style={styles.action} onPress={onPress}><View style={[styles.actionIcon, active && styles.actionActive]}><Ionicons name={icon} size={20} color={active ? '#FFFFFF' : '#8F1D3F'} /></View><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { height: 55, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  topButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9DDD6' },
  topTitle: { flex: 1, textAlign: 'center', color: '#3D3136', fontSize: 14, fontWeight: '800', marginHorizontal: 8 },
  page: { paddingHorizontal: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  hero: { flexDirection: 'row', paddingTop: 14, gap: 18 },
  cover: { width: 132, height: 190, borderRadius: 15, padding: 14, justifyContent: 'space-between' },
  coverBrand: { color: 'rgba(255,255,255,.7)', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  coverTitle: { color: '#FFFFFF', fontSize: 19, lineHeight: 24, fontWeight: '900' },
  coverAuthor: { color: 'rgba(255,255,255,.75)', fontSize: 10, fontWeight: '700' },
  heroInfo: { flex: 1, paddingVertical: 4 },
  title: { color: '#21191C', fontSize: 24, lineHeight: 29, fontWeight: '900' },
  author: { color: '#8F1D3F', fontSize: 13, fontWeight: '700', marginTop: 6 },
  metrics: { flexDirection: 'row', marginTop: 18, gap: 8 },
  metric: { flex: 1, minWidth: 0 },
  metricValue: { color: '#2E2428', fontSize: 13, fontWeight: '900', marginTop: 3 },
  metricLabel: { color: '#887B80', fontSize: 8, marginTop: 2 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
  genre: { color: '#66152F', backgroundColor: '#F0E1E5', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' },
  status: { color: '#527058', backgroundColor: '#E8EFE7', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 20 },
  tag: { color: '#70656A', borderWidth: 1, borderColor: '#DCCFC8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, fontSize: 10, fontWeight: '700' },
  description: { color: '#4E4347', fontSize: 14, lineHeight: 22, marginTop: 14 },
  more: { color: '#8F1D3F', fontSize: 12, fontWeight: '900', marginTop: 5 },
  primary: { height: 52, borderRadius: 15, backgroundColor: '#8F1D3F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 22 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15 },
  action: { alignItems: 'center', minWidth: 72 },
  actionIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#DACBC5', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center' },
  actionActive: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' },
  actionText: { color: '#5C5055', fontSize: 10, fontWeight: '700', marginTop: 5 },
  authorSection: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E3D7D0', paddingVertical: 16, marginTop: 24 },
  avatar: { width: 45, height: 45, borderRadius: 23, backgroundColor: '#6B243B', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  authorCopy: { flex: 1, marginLeft: 11 },
  authorName: { color: '#2B2125', fontSize: 14, fontWeight: '900' },
  authorFollowers: { color: '#80757A', fontSize: 10, marginTop: 3 },
  follow: { borderWidth: 1, borderColor: '#8F1D3F', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  following: { borderColor: '#D8CBC5', backgroundColor: '#F2EAE6' },
  followText: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' },
  followingText: { color: '#70656A' },
  chapterList: { borderTopWidth: 1, borderTopColor: '#DED2CB' },
  outline: { height: 46, borderWidth: 1, borderColor: '#CBA9B4', borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14 },
  outlineText: { color: '#8F1D3F', fontSize: 13, fontWeight: '900' },
  ratingLine: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: '#E1D4CD' },
  ratingValue: { color: '#261C20', fontSize: 38, fontWeight: '900' },
  stars: { color: '#B9842E', fontSize: 16, letterSpacing: 2 },
  ratingMeta: { color: '#81757A', fontSize: 10, marginTop: 3 },
  comment: { flexDirection: 'row', gap: 11, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED2CB' },
  commentAvatar: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#E8D9DC', alignItems: 'center', justifyContent: 'center' },
  commentAvatarText: { color: '#79203D', fontSize: 10, fontWeight: '900' },
  commentBody: { flex: 1 },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between' },
  commentName: { color: '#2A2024', fontSize: 12, fontWeight: '900' },
  commentText: { color: '#554A4E', fontSize: 13, lineHeight: 19, marginTop: 5 },
  commentTime: { color: '#93888C', fontSize: 9, marginTop: 5 },
  commentActions: { flexDirection: 'row', gap: 18, marginTop: 8 },
  commentAction: { color: '#776B70', fontSize: 10, fontWeight: '800' },
  liked: { color: '#8F1D3F' },
  similar: { paddingRight: 6, paddingBottom: 5 },
  sheetNote: { color: '#756B6F', fontSize: 12, marginBottom: 10 },
  downloadRow: { flexDirection: 'row', alignItems: 'center', minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1D5CE', gap: 12 },
  downloadIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1E2E6', alignItems: 'center', justifyContent: 'center' },
  downloadTitle: { color: '#2C2226', fontSize: 14, fontWeight: '800' },
  downloadMeta: { color: '#8B7E83', fontSize: 10, marginTop: 3 }
  ,loadError: { color: '#8F1D3F', backgroundColor: '#F0E1E5', padding: 9, borderRadius: 9, fontSize: 10, textAlign: 'center' }
});
