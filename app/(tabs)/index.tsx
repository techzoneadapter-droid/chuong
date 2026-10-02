import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const books = [
  { title: 'Kiếm Yên Vân', author: 'Mộc Phong', genre: 'Tiên hiệp', tone: '#294C60', badge: 'HOT' },
  { title: 'Thành Phố Sau Mưa', author: 'An Nhiên', genre: 'Đô thị', tone: '#6D2E46', badge: 'VIP' },
  { title: 'Người Giữ Ký Ức', author: 'Hạ Lam', genre: 'Fantasy', tone: '#4E426D', badge: 'MỚI' },
  { title: 'Hệ Thống Tiệm Nhỏ', author: 'Lâm Khê', genre: 'Hệ thống', tone: '#2D6A62', badge: 'HOT' }
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>CHƯƠNG</Text>
            <Text style={styles.tagline}>Mỗi chương, một thế giới.</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.iconButton}>
              <Ionicons name="search" size={21} color="#221A1D" />
            </Pressable>
            <Pressable style={styles.iconButton}>
              <Ionicons name="notifications-outline" size={21} color="#221A1D" />
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroEyebrow}>ĐANG ĐỌC</Text>
            <Text style={styles.heroPercent}>15%</Text>
          </View>
          <Text style={styles.heroTitle}>Kiếm Yên Vân</Text>
          <Text style={styles.heroSub}>Mộc Phong · Chương 186 / 1250</Text>
          <View style={styles.track}>
            <View style={styles.fill} />
          </View>
          <Pressable style={styles.continueButton}>
            <Ionicons name="book-outline" size={18} color="#FFFFFF" />
            <Text style={styles.continueText}>Đọc tiếp</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🔥 Hot hôm nay</Text>
          <Text style={styles.seeAll}>Xem tất cả</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {books.map((book) => (
            <View style={styles.card} key={book.title}>
              <View style={[styles.cover, { backgroundColor: book.tone }]}>
                <Text style={styles.coverBrand}>CHƯƠNG</Text>
                <Text style={styles.coverTitle}>{book.title}</Text>
                <Text style={styles.badge}>{book.badge}</Text>
              </View>
              <Text numberOfLines={2} style={styles.cardTitle}>{book.title}</Text>
              <Text style={styles.cardMeta}>{book.author} · {book.genre}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Dành cho bạn</Text>
          <Text style={styles.seeAll}>Khám phá</Text>
        </View>

        <View style={styles.recommend}>
          <View style={styles.recommendText}>
            <Text style={styles.recommendKicker}>TUYỂN CHỌN RIÊNG</Text>
            <Text style={styles.recommendTitle}>Truyện hợp gu của bạn sẽ xuất hiện ở đây.</Text>
            <Text style={styles.recommendBody}>
              Sau khi đọc vài chương, CHƯƠNG sẽ cá nhân hóa đề xuất theo thể loại và tác giả bạn yêu thích.
            </Text>
          </View>
          <Ionicons name="sparkles" size={36} color="#8F1D3F" />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tác giả Việt</Text>
          <Text style={styles.seeAll}>Xem thêm</Text>
        </View>

        <View style={styles.authorBox}>
          <Text style={styles.authorTitle}>Viết câu chuyện của riêng bạn</Text>
          <Text style={styles.authorBody}>Đăng truyện, theo dõi độc giả và xây dựng cộng đồng người đọc.</Text>
          <Pressable style={styles.authorButton}>
            <Text style={styles.authorButtonText}>Bắt đầu viết</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  page: { paddingBottom: 36 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  brand: { color: '#8F1D3F', fontSize: 25, fontWeight: '900', letterSpacing: 1.3 },
  tagline: { color: '#756B6F', fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFDFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E9DDD6'
  },
  hero: {
    marginHorizontal: 16,
    backgroundColor: '#66152F',
    borderRadius: 24,
    padding: 20,
    minHeight: 196
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between' },
  heroEyebrow: { color: '#E9C6D1', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  heroPercent: { color: '#E9C6D1', fontSize: 12, fontWeight: '800' },
  heroTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 22 },
  heroSub: { color: '#E9C6D1', fontSize: 13, marginTop: 5 },
  track: { height: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 20 },
  fill: { width: '15%', height: 5, borderRadius: 99, backgroundColor: '#FFFFFF' },
  continueButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: '#8F1D3F',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999
  },
  continueText: { color: '#FFFFFF', fontWeight: '800' },
  sectionHeader: {
    marginTop: 28,
    paddingHorizontal: 16,
    marginBottom: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: { color: '#221A1D', fontSize: 20, fontWeight: '900' },
  seeAll: { color: '#8F1D3F', fontSize: 12, fontWeight: '800' },
  row: { paddingLeft: 16, paddingRight: 4 },
  card: { width: 140, marginRight: 14 },
  cover: { height: 190, borderRadius: 16, padding: 14, justifyContent: 'space-between' },
  coverBrand: { color: 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  coverTitle: { color: '#FFFFFF', fontSize: 18, lineHeight: 22, fontWeight: '900' },
  badge: {
    alignSelf: 'flex-start',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '900'
  },
  cardTitle: { color: '#221A1D', fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 9 },
  cardMeta: { color: '#756B6F', fontSize: 11, marginTop: 3 },
  recommend: {
    marginHorizontal: 16,
    backgroundColor: '#F0E1E5',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  recommendText: { flex: 1 },
  recommendKicker: { color: '#8F1D3F', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  recommendTitle: { color: '#221A1D', fontSize: 18, lineHeight: 24, fontWeight: '900', marginTop: 6 },
  recommendBody: { color: '#756B6F', fontSize: 12, lineHeight: 18, marginTop: 5 },
  authorBox: {
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 22,
    backgroundColor: '#FFFDFC',
    borderWidth: 1,
    borderColor: '#E9DDD6'
  },
  authorTitle: { color: '#221A1D', fontSize: 19, fontWeight: '900' },
  authorBody: { color: '#756B6F', fontSize: 13, lineHeight: 20, marginTop: 6 },
  authorButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 15,
    backgroundColor: '#8F1D3F',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12
  },
  authorButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 }
});
