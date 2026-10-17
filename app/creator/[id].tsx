import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, useWindowDimensions, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthorGiftSheet } from '../../components/AuthorGiftSheet';
import { BookCard } from '../../components/BookCard';
import { LoadingState, RetryState } from '../../components/States';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';
import { AUTHOR_PAGE_SIZE, getPublicAuthorBooks, getPublicAuthorHub, PublicAuthorHub } from '../../services/creator';
import { setFollowState } from '../../services/library';
import { Book } from '../../types';

export default function CreatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((Math.min(width, 960) - 36 + 12) / 158));
  const { user, loading: authLoading } = useAuth();
  const [author, setAuthor] = useState<PublicAuthorHub | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const bookRows = useMemo(() => Array.from({ length: Math.ceil(books.length / columns) },
    (_, index) => books.slice(index * columns, (index + 1) * columns)), [books, columns]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [paging, setPaging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const request = useRef(0);
  const pagePending = useRef(false);
  const load = useCallback(async () => {
    if (authLoading) return;
    const token = ++request.current;
    setLoading(true); setError(''); setPageError(''); setGiftOpen(false);
    try {
      const next = await getPublicAuthorHub(id);
      const catalog = next ? await getPublicAuthorBooks(next) : [];
      if (token !== request.current) return;
      setAuthor(next); setBooks(catalog); setHasMore(catalog.length === AUTHOR_PAGE_SIZE);
    } catch (cause) {
      if (token === request.current) setError(cause instanceof Error ? cause.message : 'Không thể tải trang tác giả.');
    } finally { if (token === request.current) setLoading(false); }
  }, [id, user?.id, authLoading]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { request.current++; };
  }, [load]));

  const nextPage = async () => {
    if (!author || pagePending.current || !hasMore) return;
    pagePending.current = true; setPaging(true); setPageError('');
    const token = request.current;
    try {
      const next = await getPublicAuthorBooks(author, books.length);
      if (token !== request.current) return;
      setBooks(current => [...current, ...next.filter(book => !current.some(item => item.id === book.id))]);
      setHasMore(next.length === AUTHOR_PAGE_SIZE);
    } catch (cause) {
      if (token === request.current) setPageError(cause instanceof Error ? cause.message : 'Không thể tải thêm truyện.');
    } finally { pagePending.current = false; setPaging(false); }
  };
  const follow = async () => {
    if (!user) { router.push('/auth/login'); return; }
    if (!author || saving || !author.viewer_can_follow) return;
    setSaving(true); setPageError('');
    try {
      await setFollowState('author', author.author_id, !author.viewer_follows, user.id);
      const next = await getPublicAuthorHub(author.author_id);
      setAuthor(next);
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : 'Không thể cập nhật theo dõi.'); }
    finally { setSaving(false); }
  };
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={xianxia.ink} /></Pressable>
      <Text style={styles.heading}>Trang tác giả</Text>
    </View>
    {loading ? <LoadingState label="Đang tải trang tác giả…" /> : error ? <RetryState detail={error} onRetry={() => { void load(); }} /> : !author ? <View style={styles.page}><Text style={styles.heading}>Không tìm thấy tác giả</Text><Text style={styles.copy}>Trang tác giả hiện không khả dụng.</Text></View> : <FlatList
      data={bookRows} keyExtractor={(row) => row[0].id}
      contentContainerStyle={[styles.page, { gap: 0 }]}
      initialNumToRender={3} maxToRenderPerBatch={3} windowSize={5} removeClippedSubviews={false}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      renderItem={({ item: row }) => <View style={styles.grid}>{row.map(book => <View key={book.id} style={styles.book}><BookCard book={book} /></View>)}</View>}
      ListHeaderComponent={<View style={{ gap: 18, paddingBottom: 18 }}>

      <View style={styles.profile}>
        {author.avatar_url ? <Image source={{ uri: author.avatar_url }} accessibilityLabel={`Ảnh ${author.pen_name}`} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.initial}>{author.pen_name.slice(0, 1)}</Text></View>}
        <Text style={styles.name}>{author.pen_name}</Text>
        {author.verified ? <Text style={styles.verified}>✓ Tác giả đã xác minh</Text> : null}
        {author.bio ? <Text style={styles.copy}>{author.bio}</Text> : null}
        <Text style={styles.stats}>{author.followers_count} người theo dõi · {author.public_books_count} truyện công khai</Text>
        {author.viewer_is_author ? <Text style={styles.copy}>Đây là trang tác giả của bạn.</Text> : <Pressable accessibilityRole="button" disabled={saving || Boolean(user && !author.viewer_can_follow)} style={styles.button} onPress={() => { void follow(); }}><Text style={styles.buttonText}>{saving ? 'Đang cập nhật…' : author.viewer_follows ? 'Đang theo dõi' : 'Theo dõi tác giả'}</Text></Pressable>}
        {!user ? <Text style={styles.copy}>Đăng nhập để theo dõi và nhận thông báo truyện mới.</Text> : null}
        {!author.viewer_is_author && author.gift_book_id ? <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => user ? setGiftOpen(true) : router.push('/auth/login')}><Text style={styles.verified}>Tặng quà tác giả</Text></Pressable> : !author.gift_book_id ? <Text style={styles.copy}>Chưa có truyện công khai để nhận quà.</Text> : null}
      </View>
      <Text style={styles.heading}>Truyện của tác giả</Text>
      {pageError ? <Text accessibilityRole="alert" style={styles.error}>{pageError}</Text> : null}
      </View>}
      ListEmptyComponent={<Text style={styles.copy}>Tác giả chưa có truyện công khai.</Text>}
      ListFooterComponent={<View style={{ marginTop: 18 }}>
      {hasMore ? <Pressable accessibilityRole="button" disabled={paging} style={styles.secondary} onPress={() => { void nextPage(); }}><Text style={styles.verified}>{paging ? 'Đang tải…' : pageError ? 'Thử tải lại' : 'Xem thêm truyện'}</Text></Pressable> : books.length ? <Text style={styles.copy}>Đã hiển thị tất cả truyện công khai.</Text> : null}
      </View>}
    />}
    {user && author && !author.viewer_is_author && author.gift_book_id ? <AuthorGiftSheet visible={giftOpen} onClose={() => setGiftOpen(false)} bookId={author.gift_book_id} bookTitle={author.gift_book_title ?? ''} authorName={author.pen_name} userId={user.id} onOpenWallet={() => { setGiftOpen(false); router.push('/wallet/store'); }} /> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  back: { padding: 10 },
  page: { padding: 18, paddingBottom: 40, width: '100%', maxWidth: 960, alignSelf: 'center', gap: 18 },
  profile: { padding: 20, borderRadius: 18, backgroundColor: xianxia.card, borderWidth: 1, borderColor: xianxia.line, gap: 12, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: xianxia.jadeMist, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 32, color: xianxia.jadeDeep, fontWeight: '800' },
  name: { fontSize: 24, fontWeight: '800', color: xianxia.ink, textAlign: 'center' },
  heading: { fontSize: 19, fontWeight: '800', color: xianxia.ink },
  copy: { fontSize: 14, lineHeight: 22, color: xianxia.muted },
  stats: { fontSize: 13, color: xianxia.muted, textAlign: 'center' },
  verified: { color: xianxia.jadeDeep, fontSize: 14, fontWeight: '700' },
  button: { backgroundColor: xianxia.cinnabar, borderRadius: 12, padding: 14, minHeight: 48 },
  buttonText: { color: xianxia.white, fontWeight: '700', textAlign: 'center' },
  secondary: { borderWidth: 1, borderColor: xianxia.line, borderRadius: 12, padding: 14, minHeight: 48, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  book: { width: 146 },
  error: { color: xianxia.danger, lineHeight: 22 },
});
