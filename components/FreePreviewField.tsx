import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FREE_PREVIEW_PRESETS } from '../lib/freeChapterPreview';
import { xianxia } from '../constants/xianxia';

export function FreePreviewField({ value, onChange, disabled = false, previous = 0 }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; previous?: number;
}) {
  return <View style={styles.card}>
    <Text style={styles.title}>Số chương đầu đọc thử miễn phí</Text>
    <Text style={styles.help}>Chương 1 đến N đọc miễn phí. Từ chương N+1 giữ chính sách VIP của truyện/chương. Bản nháp hoặc nội dung chưa được duyệt không được công khai.</Text>
    <View style={styles.presets}>{FREE_PREVIEW_PRESETS.map(number => <Pressable key={number} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={`${number} chương đọc thử`} onPress={() => onChange(String(number))}
      style={[styles.chip, value === String(number) && styles.selected]}><Text style={styles.chipText}>{number}</Text></Pressable>)}</View>
    <TextInput accessibilityLabel="Số chương đọc thử miễn phí" value={value} onChangeText={onChange} editable={!disabled}
      keyboardType="number-pad" maxLength={6} placeholder="0 đến 100000" style={styles.input} />
    {Number(value) < previous ? <Text style={styles.warning}>Giảm số chương đọc thử có thể khiến các chương từng miễn phí yêu cầu mở khóa. Các quyền đã mua vẫn giữ nguyên.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 14, marginVertical: 12, borderRadius: 14, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: xianxia.line },
  title: { fontSize: 12, fontWeight: '900', color: xianxia.jadeDeep },
  help: { fontSize: 10, lineHeight: 16, color: xianxia.muted, marginVertical: 8 },
  presets: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { minWidth: 44, padding: 9, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: xianxia.line },
  selected: { borderColor: xianxia.jadeDeep, backgroundColor: '#FFF8EA' },
  chipText: { color: xianxia.jadeDeep, fontWeight: '800', fontSize: 12 },
  input: { backgroundColor: '#FFF8EA', borderRadius: 10, padding: 10, color: xianxia.ink, borderWidth: 1, borderColor: xianxia.line },
  warning: { color: xianxia.cinnabar, fontSize: 10, lineHeight: 16, marginTop: 8 },
});
