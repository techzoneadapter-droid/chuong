import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const items = [
  ['Kiếm Yên Vân', 'Chương 186 / 1250', 15, '#294C60'],
  ['Thành Phố Sau Mưa', 'Chương 86 / 210', 42, '#6D2E46'],
  ['Người Giữ Ký Ức', 'Chương 34 / 120', 28, '#4E426D']
] as const;

export default function LibraryScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.page}>
        <Text style={styles.title}>Tủ sách</Text>
        <View style={styles.tabs}>
          <Text style={styles.active}>Đang đọc</Text>
          <Text style={styles.tab}>Đã tải</Text>
          <Text style={styles.tab}>Yêu thích</Text>
        </View>
        {items.map(([title, chapter, progress, tone]) => (
          <View style={styles.row} key={title}>
            <View style={[styles.cover, { backgroundColor: tone }]}><Text style={styles.coverText}>{title[0]}</Text></View>
            <View style={styles.meta}>
              <Text style={styles.bookTitle}>{title}</Text>
              <Text style={styles.chapter}>{chapter}</Text>
              <View style={styles.track}><View style={[styles.fill, { width: String(progress) + '%' }]} /></View>
              <Text style={styles.progress}>{progress}% đã đọc</Text>
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  page: { padding: 16 },
  title: { color: '#221A1D', fontSize: 30, fontWeight: '900', marginTop: 8 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 10 },
  active: { color: '#FFFFFF', backgroundColor: '#8F1D3F', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, fontSize: 12, fontWeight: '800' },
  tab: { color: '#756B6F', paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#E9DDD6' },
  cover: { width: 70, height: 94, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  coverText: { color: '#FFFFFF', fontSize: 29, fontWeight: '900' },
  meta: { flex: 1, paddingLeft: 13, justifyContent: 'center' },
  bookTitle: { color: '#221A1D', fontSize: 16, fontWeight: '900' },
  chapter: { color: '#756B6F', fontSize: 12, marginTop: 4 },
  track: { height: 4, backgroundColor: '#E3D9D3', borderRadius: 99, marginTop: 12, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#8F1D3F' },
  progress: { color: '#756B6F', fontSize: 10, marginTop: 5 }
});
