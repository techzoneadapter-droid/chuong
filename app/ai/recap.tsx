import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getBook } from '../../data/books';

const sections = [
  { icon: 'flash-outline', title: 'Chuyện gì vừa xảy ra', body: 'Diệp Phàm nhận được một bức thư có dấu cánh chim, biết manh mối về cha mình đã được chuyển lên phía Bắc. Dù nhận ra đây có thể là một cái bẫy, anh vẫn quyết định đi qua rừng Thạch Môn.' },
  { icon: 'people-outline', title: 'Nhân vật quan trọng', body: 'Diệp Phàm — người mang thanh kiếm gãy; người đồng hành bí ẩn đã giao bức thư; Lâm Động — người dẫn đường am hiểu vùng biên.' },
  { icon: 'flag-outline', title: 'Mục tiêu hiện tại', body: 'Tới cửa ải phía Bắc trước khi manh mối bị xóa và tìm người đã gửi bức thư.' },
  { icon: 'location-outline', title: 'Địa điểm', body: 'Rừng Thạch Môn, con đường cũ nối thị trấn Yên Vân với vùng biên phía Bắc.' },
  { icon: 'git-network-outline', title: 'Mối quan hệ', body: 'Diệp Phàm và người đồng hành đã tin cậy nhau hơn, nhưng cả hai vẫn giữ lại những bí mật riêng.' }
] as const;

export default function RecapScreen() {
  const router = useRouter();
  const { bookId, chapter } = useLocalSearchParams<{ bookId?: string; chapter?: string }>();
  const book = getBook(bookId);
  const current = Number(chapter) || Math.max(1, Math.floor(book.totalChapters * book.progress / 100));
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <View style={styles.header}><Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable><View style={{ flex: 1, marginLeft: 11 }}><Text style={styles.title}>Tóm tắt đến đây</Text><Text style={styles.subtitle}>{book.title}</Text></View><Ionicons name="sparkles" size={19} color="#8F1D3F" /></View>
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.safety}><Ionicons name="shield-checkmark-outline" size={20} color="#8F1D3F" /><Text style={styles.safetyText}>Chỉ sử dụng nội dung đến chương bạn đã đọc. Không tiết lộ chương sau.</Text></View>
      <Text style={styles.positionLabel}>BẠN ĐANG Ở</Text><Text style={styles.position}>Chương {current}</Text><Text style={styles.chapterTitle}>{book.chapters[current - 1]?.title}</Text>
      <View style={styles.rule} />
      {sections.map((section, index) => <View key={section.title} style={styles.section}><View style={styles.iconColumn}><View style={styles.icon}><Ionicons name={section.icon} size={18} color="#8F1D3F" /></View>{index < sections.length - 1 ? <View style={styles.timeline} /> : null}</View><View style={styles.copy}><Text style={styles.sectionTitle}>{section.title}</Text><Text style={styles.body}>{section.body}</Text></View></View>)}
      <Text style={styles.generated}>Bản tóm tắt minh họa được tạo cục bộ · Cập nhật theo tiến độ đọc</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' }, header: { height: 61, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E3D6D0', alignItems: 'center', justifyContent: 'center' }, title: { color: '#291F23', fontSize: 18, fontWeight: '900' }, subtitle: { color: '#81757A', fontSize: 10, marginTop: 2 }, page: { padding: 18, paddingBottom: 42, maxWidth: 700, width: '100%', alignSelf: 'center' },
  safety: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 13, backgroundColor: '#F1E3E7', borderLeftWidth: 3, borderLeftColor: '#8F1D3F' }, safetyText: { flex: 1, color: '#694650', fontSize: 11, lineHeight: 17, fontWeight: '700' }, positionLabel: { color: '#8F1D3F', fontSize: 9, letterSpacing: 1.4, fontWeight: '900', textAlign: 'center', marginTop: 30 }, position: { color: '#2C2226', fontSize: 29, fontWeight: '900', textAlign: 'center', marginTop: 7 }, chapterTitle: { color: '#756A6F', fontSize: 13, textAlign: 'center', marginTop: 4 }, rule: { width: 34, height: 1, backgroundColor: '#A9969D', alignSelf: 'center', marginVertical: 26 },
  section: { flexDirection: 'row', minHeight: 112 }, iconColumn: { width: 43, alignItems: 'center' }, icon: { width: 37, height: 37, borderRadius: 19, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' }, timeline: { width: 1, flex: 1, backgroundColor: '#D9CBC5', marginVertical: 5 }, copy: { flex: 1, paddingLeft: 11, paddingBottom: 21 }, sectionTitle: { color: '#33282C', fontSize: 14, fontWeight: '900', marginTop: 7 }, body: { color: '#62565B', fontSize: 13, lineHeight: 20, marginTop: 7 }, generated: { color: '#91858A', fontSize: 9, textAlign: 'center', marginTop: 12 }
});
