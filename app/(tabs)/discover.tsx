import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const genres = ['Tiên hiệp', 'Ngôn tình', 'Đô thị', 'Xuyên không', 'Hệ thống', 'Trinh thám', 'Kinh dị', 'Fantasy'];

export default function DiscoverScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.title}>Khám phá</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={19} color="#756B6F" />
          <TextInput
            placeholder="Tìm truyện, tác giả, thể loại..."
            placeholderTextColor="#9B9195"
            style={styles.input}
          />
        </View>
        <Text style={styles.heading}>Thể loại</Text>
        <View style={styles.chips}>
          {genres.map((genre) => <Text style={styles.chip} key={genre}>{genre}</Text>)}
        </View>
        <Text style={styles.heading}>Đang nổi bật</Text>
        <View style={styles.feature}>
          <Text style={styles.kicker}>BXH HÔM NAY</Text>
          <Text style={styles.featureTitle}>Những câu chuyện được đọc nhiều nhất</Text>
          <Text style={styles.body}>Codex sẽ tiếp tục xây bộ lọc, tìm kiếm, BXH và danh sách truyện từ nền tảng này.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  page: { padding: 16, paddingBottom: 40 },
  title: { color: '#221A1D', fontSize: 30, fontWeight: '900', marginTop: 8, marginBottom: 18 },
  search: { height: 52, backgroundColor: '#FFFDFC', borderRadius: 16, borderWidth: 1, borderColor: '#E9DDD6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  input: { flex: 1, marginLeft: 10, color: '#221A1D', fontSize: 15 },
  heading: { color: '#221A1D', fontSize: 19, fontWeight: '900', marginTop: 24, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { color: '#66152F', backgroundColor: '#F0E1E5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, fontWeight: '700', fontSize: 12 },
  feature: { backgroundColor: '#FFFDFC', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: '#E9DDD6' },
  kicker: { color: '#8F1D3F', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  featureTitle: { color: '#221A1D', fontSize: 21, lineHeight: 27, fontWeight: '900', marginTop: 7 },
  body: { color: '#756B6F', fontSize: 13, lineHeight: 20, marginTop: 8 }
});
