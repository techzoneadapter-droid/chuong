import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../../components/States';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { AssetBookCover, ButtonArt } from '../../components/Artwork';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthorForUser, getMyBooks } from '../../services/authors';
import { Author, Book } from '../../types';

export default function WriteScreen() {
  const router = useRouter();
  const { user, configured } = useAuth();
  const [author, setAuthor] = useState<Author | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) { setLoading(false); setAuthor(null); setBooks([]); return; }
    setLoading(true);
    setError('');
    try {
      const profile = await getAuthorForUser(user.id);
      setAuthor(profile);
      setBooks(profile ? await getMyBooks(profile.id) : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải studio.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang mở Văn Các…" /></SafeAreaView>;
  if (error) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><RetryState detail={error} onRetry={load} /></SafeAreaView>;

  if (!user) return <SafeAreaView style={styles.safe}>
    <XianxiaBackdrop />
    <View style={styles.centerPage}>
      <View style={styles.sealLarge}><Ionicons name="create-outline" size={25} color={xianxia.goldSoft} /></View>
      <Text style={styles.kicker}>VĂN CÁC · AUTHOR STUDIO</Text>
      <Text style={styles.title}>Viết câu chuyện của bạn.</Text>
      <Text style={styles.body}>Tạo thế giới, đăng từng chương và xây cộng đồng độc giả trên CHƯƠNG.</Text>
      <Pressable style={styles.primaryButton} onPress={() => router.push('/auth/login')}>
        <ButtonArt />
        <Ionicons name="log-in-outline" size={18} color={xianxia.goldSoft} />
        <Text style={styles.primaryButtonText}>Đăng nhập / Đăng ký</Text>
        <Ionicons name="arrow-forward" size={16} color={xianxia.white} />
      </Pressable>
      {!configured && __DEV__ ? <Text style={styles.demo}>Demo · Supabase chưa được cấu hình để lưu dữ liệu.</Text> : null}
      {!configured ? <View style={styles.previewLinks}>
        <Pressable onPress={() => router.push('/author/onboarding')}><Text style={styles.link}>Xem đăng ký tác giả</Text></Pressable>
        <Pressable onPress={() => router.push('/author/books/new')}><Text style={styles.link}>Xem tạo truyện</Text></Pressable>
        <Pressable onPress={() => router.push({ pathname: '/author/books/[bookId]/chapters/[chapterId]', params: { bookId: 'demo', chapterId: 'new' } })}><Text style={styles.link}>Xem trình soạn thảo</Text></Pressable>
      </View> : null}
    </View>
  </SafeAreaView>;

  if (!author) return <SafeAreaView style={styles.safe}>
    <XianxiaBackdrop />
    <View style={styles.centerPage}>
      <View style={styles.sealLarge}><Ionicons name="leaf-outline" size={25} color={xianxia.goldSoft} /></View>
      <Text style={styles.kicker}>KHAI BÚT NHẬP ĐẠO</Text>
      <Text style={styles.title}>Trở thành tác giả CHƯƠNG.</Text>
      <Text style={styles.body}>Tạo bút danh, giới thiệu bản thân và xác nhận quyền sử dụng nội dung trước khi xuất bản.</Text>
      <Pressable style={styles.primaryButton} onPress={() => router.push('/author/onboarding')}>
        <ButtonArt />
        <Ionicons name="brush-outline" size={18} color={xianxia.goldSoft} />
        <Text style={styles.primaryButtonText}>Trở thành tác giả</Text>
        <Ionicons name="arrow-forward" size={16} color={xianxia.white} />
      </Pressable>
    </View>
  </SafeAreaView>;

  const views = books.reduce((sum, book) => sum + (book.viewsCount ?? 0), 0);
  const followers = books.reduce((sum, book) => sum + (book.followersCount ?? 0), 0);
  const chapters = books.reduce((sum, book) => sum + book.totalChapters, 0);
  const drafts = books.filter((book) => book.backendStatus === 'draft').length;
  const published = books.filter((book) => book.backendStatus === 'ongoing').length;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.headRow}>
        <View>
          <Text style={styles.kicker}>VĂN CÁC · AUTHOR STUDIO</Text>
          <Text style={styles.penName}>{author.penName}</Text>
          <Text style={styles.subhead}>Viết · xuất bản · theo dõi hành trình độc giả.</Text>
        </View>
        <Pressable style={styles.add} onPress={() => router.push('/author/books/new')}>
          <Ionicons name="add" size={21} color={xianxia.goldSoft} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroSeal}><Ionicons name="document-text-outline" size={23} color={xianxia.goldSoft} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Mỗi chương là một bước trên tiên lộ.</Text>
          <Text style={styles.heroBody}>Lượt đọc được ghi nhận từ phiên đọc thật. Phân tích được tổng hợp định kỳ để giữ hệ thống ổn định khi lượng độc giả tăng cao.</Text>
        </View>
      </View>

      <View style={styles.quickGrid}>
        {[
          ['wallet-outline', 'Doanh thu tác giả', 'Linh Thạch · hoàn tiền · đối soát', '/author/revenue'],
          ['trophy-outline', 'Đại Hội Văn Đạo', 'Sự kiện · mục tiêu viết · bảng xếp hạng', '/author/events'],
          ['star-outline', 'Đánh giá độc giả', 'Điểm sao · cảm nhận · phản hồi', '/author/reviews'],
          ['analytics-outline', 'Phân tích độc giả', 'Phiên đọc · hoàn thành · quay lại', '/author/analytics'],
        ].map(([icon, title, body, href]) => <Pressable key={href} style={styles.quickCard} onPress={() => router.push(href as never)}>
          <View style={styles.quickIcon}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={19} color={xianxia.jadeDeep} /></View>
          <View style={{ flex: 1 }}><Text style={styles.quickTitle}>{title}</Text><Text style={styles.quickBody}>{body}</Text></View>
          <Ionicons name="chevron-forward" size={17} color={xianxia.jade} />
        </Pressable>)}
      </View>

      <View style={styles.metrics}>
        {[
          [String(views), 'Lượt đọc'],
          [String(followers), 'Theo dõi truyện'],
          [String(chapters), 'Tổng chương'],
          [String(books.reduce((sum, book) => sum + (book.draftChapters ?? 0), 0)), 'Chương nháp'],
          [String(drafts), 'Truyện nháp'],
          [String(published), 'Đang xuất bản'],
          [String(books.filter((book) => book.backendStatus === 'completed').length), 'Đã hoàn thành'],
          [String(author.followersCount), 'Theo dõi tác giả'],
        ].map(([value, label]) => <View style={styles.metric} key={label}><Text style={styles.value}>{value}</Text><Text style={styles.label}>{label}</Text></View>)}
      </View>

      <View style={styles.sectionHead}>
        <View><Text style={styles.sectionKicker}>LINH QUYỂN CỦA TA</Text><Text style={styles.sectionTitle}>Truyện của tôi</Text></View>
        <Pressable style={styles.createMini} onPress={() => router.push('/author/books/new')}><Ionicons name="add" size={15} color={xianxia.goldSoft} /><Text style={styles.createMiniText}>Tạo truyện</Text></Pressable>
      </View>

      {books.length === 0 ? <EmptyState title="Chưa có truyện" detail="Tạo linh quyển đầu tiên để bắt đầu viết chương." /> : <View style={styles.bookList}>
        {books.map((book) => <View style={styles.bookRow} key={book.id}>
          <View style={styles.coverFrame}>
            <View style={styles.cover}>
              <AssetBookCover bookId={book.id} title={book.title} coverUrl={book.coverUrl} style={StyleSheet.absoluteFillObject} />
              <View pointerEvents="none" style={styles.coverShade} />
              <View style={styles.coverSeal}><Ionicons name="create-outline" size={13} color={xianxia.goldSoft} /></View>
            </View>
          </View>
          <Pressable style={styles.bookInfo} onPress={() => router.push({ pathname: '/author/books/[bookId]/chapters', params: { bookId: book.id } })}>
            <Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text>
            <Text style={styles.bookMeta}>{book.status} · {book.publishedChapters ?? book.totalChapters} đã xuất bản · {book.draftChapters ?? 0} nháp</Text>
            <Text style={styles.bookMeta}>{book.views} lượt đọc · {book.followers} theo dõi</Text>
            <View style={styles.statusPill}><Text style={styles.statusPillText}>{book.visibility === 'public' && book.backendStatus !== 'draft' ? 'CÔNG KHAI' : 'RIÊNG TƯ'}</Text></View>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: '/author/books/[bookId]/chapters/[chapterId]', params: { bookId: book.id, chapterId: 'new' } })} style={styles.write}>
            <Ionicons name="brush-outline" size={16} color={xianxia.goldSoft} />
            <Text style={styles.writeText}>Viết</Text>
          </Pressable>
        </View>)}
      </View>}

      <Pressable style={styles.primaryButton} onPress={() => router.push('/author/books/new')}>
        <ButtonArt />
        <Ionicons name="add-circle-outline" size={18} color={xianxia.goldSoft} />
        <Text style={styles.primaryButtonText}>Tạo truyện mới</Text>
        <Ionicons name="arrow-forward" size={16} color={xianxia.white} />
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  page: { padding: 16, paddingBottom: 44, width: '100%', maxWidth: 740, alignSelf: 'center' },
  centerPage: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(255,248,234,.84)', borderRadius: 22 },
  sealLarge: { width: 60, height: 60, borderRadius: 18, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  sealLargeText: { color: '#F4DDA8', fontSize: 28, fontWeight: '900' },
  kicker: { color: xianxia.cinnabar, fontSize: 8.5, fontWeight: '900', letterSpacing: 1.4, marginTop: 10 },
  title: { color: '#24231F', fontSize: 30, lineHeight: 37, fontWeight: '800', marginTop: 8, maxWidth: 360 },
  body: { color: '#514D47', fontSize: 13, lineHeight: 21, marginTop: 9, maxWidth: 430, fontWeight: '500' },
  demo: { color: xianxia.muted, fontSize: 9, marginTop: 12 },
  previewLinks: { gap: 9, marginTop: 14 },
  link: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  penName: { color: xianxia.ink, fontSize: 27, fontWeight: '900', marginTop: 5 },
  subhead: { color: xianxia.muted, fontSize: 9, marginTop: 4 },
  add: { width: 43, height: 43, borderRadius: 14, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: '#496A61', alignItems: 'center', justifyContent: 'center' },
  hero: { marginTop: 16, minHeight: 126, borderRadius: 20, padding: 16, backgroundColor: '#27423B', borderWidth: 1, borderColor: '#496A61', flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden' },
  heroSeal: { width: 50, height: 50, borderRadius: 15, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  heroSealText: { color: '#F4DDA8', fontSize: 23, fontWeight: '900' },
  heroCopy: { flex: 1, zIndex: 2 },
  heroTitle: { color: xianxia.white, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  heroBody: { color: 'rgba(255,253,248,.90)', fontSize: 9, lineHeight: 14, marginTop: 5, fontWeight: '500' },
  quickGrid: { gap: 9, marginTop: 13 },
  quickCard: { minHeight: 68, borderRadius: 16, backgroundColor: 'rgba(255,253,247,.96)', borderWidth: 1, borderColor: xianxia.line, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  quickIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#BCD0C1', alignItems: 'center', justifyContent: 'center' },
  quickTitle: { color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  quickBody: { color: xianxia.muted, fontSize: 8, marginTop: 3 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 16 },
  metric: { width: '47%', flexGrow: 1, minHeight: 78, padding: 13, backgroundColor: 'rgba(255,253,247,.96)', borderRadius: 15, borderWidth: 1, borderColor: xianxia.line, justifyContent: 'center' },
  value: { color: xianxia.jadeDeep, fontSize: 21, fontWeight: '900' },
  label: { color: xianxia.muted, fontSize: 9, marginTop: 3, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 25, marginBottom: 8 },
  sectionKicker: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: xianxia.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },
  createMini: { minHeight: 36, borderRadius: 11, paddingHorizontal: 10, backgroundColor: xianxia.jadeDeep, flexDirection: 'row', alignItems: 'center', gap: 5 },
  createMiniText: { color: xianxia.white, fontSize: 8.5, fontWeight: '900' },
  bookList: { gap: 9 },
  bookRow: { minHeight: 132, borderRadius: 18, backgroundColor: 'rgba(255,253,247,.97)', borderWidth: 1, borderColor: xianxia.line, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  coverFrame: { padding: 2, borderRadius: 13, backgroundColor: xianxia.goldSoft },
  cover: { width: 67, height: 100, borderRadius: 8, overflow: 'hidden', justifyContent: 'center', borderWidth: 1, borderColor: xianxia.gold },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,20,18,.05)' },
  coverSeal: { position: 'absolute', right: 4, top: 4, width: 18, height: 18, borderRadius: 5, backgroundColor: 'rgba(132,50,41,.82)', borderWidth: 1, borderColor: 'rgba(229,209,163,.7)', alignItems: 'center', justifyContent: 'center' },
  coverSealText: { color: '#F3D99D', fontSize: 7.5, fontWeight: '900' },
  bookInfo: { flex: 1 },
  bookTitle: { color: xianxia.ink, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  bookMeta: { color: '#514D47', fontSize: 8.5, lineHeight: 12, marginTop: 4, fontWeight: '500' },
  statusPill: { alignSelf: 'flex-start', marginTop: 7, borderRadius: 99, backgroundColor: xianxia.jadeMist, paddingHorizontal: 7, paddingVertical: 4 },
  statusPillText: { color: xianxia.jadeDeep, fontSize: 6.8, fontWeight: '900' },
  write: { minWidth: 48, minHeight: 50, borderRadius: 12, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: '#496A61', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  writeText: { color: xianxia.white, fontSize: 8, fontWeight: '900', marginTop: 2 },
  primaryButton: { position: 'relative', overflow: 'hidden', marginTop: 20, minHeight: 56, borderRadius: 14, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, paddingHorizontal: 18, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', shadowColor: '#2B342E', shadowOpacity: .18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  primaryButtonText: { flex: 1, color: '#FFF8EA', fontSize: 12, fontWeight: '900', textAlign: 'center', textShadowColor: 'rgba(0,0,0,.28)', textShadowRadius: 2 },
});
