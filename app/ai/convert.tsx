import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConvertMode, convertExcerpt, originalExcerpt } from '../../services/ai';

const modes: ConvertMode[] = ['Convert chuẩn', 'Convert mượt', 'Hiện đại', 'Kiếm hiệp', 'Ngôn tình'];

export default function ConvertScreen() {
  const router = useRouter();
  const { bookId, chapter } = useLocalSearchParams<{ bookId?: string; chapter?: string }>();
  const [mode, setMode] = useState<ConvertMode>('Convert mượt');
  const [variation, setVariation] = useState(0);
  const [result, setResult] = useState(convertExcerpt(mode));
  const [editing, setEditing] = useState(false);
  const [applied, setApplied] = useState(false);
  const chooseMode = (value: ConvertMode) => { setMode(value); setVariation(0); setResult(convertExcerpt(value)); setApplied(false); };
  const regenerate = () => { const next = variation + 1; setVariation(next); setResult(convertExcerpt(mode, next)); setApplied(false); };

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <View style={styles.header}><Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable><View style={styles.headCopy}><Text style={styles.title}>AI Convert</Text><Text style={styles.subtitle}>{bookId ? `Chương ${chapter ?? ''} · ` : ''}Biên tập câu chữ</Text></View><View style={styles.aiBadge}><Ionicons name="sparkles" size={15} color="#8F1D3F" /></View></View>
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>CHỌN VĂN PHONG</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modes}>{modes.map((item) => <Pressable key={item} onPress={() => chooseMode(item)} style={[styles.mode, mode === item && styles.modeActive]}><Text style={[styles.modeText, mode === item && styles.modeTextActive]}>{item}</Text></Pressable>)}</ScrollView>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Bản gốc</Text><Text style={styles.count}>{originalExcerpt.length} ký tự</Text></View>
      <View style={styles.original}><Text style={styles.originalText}>{originalExcerpt}</Text></View>
      <View style={styles.transition}><View style={styles.transitionLine} /><View style={styles.spark}><Ionicons name="sparkles" size={17} color="#FFFFFF" /></View><View style={styles.transitionLine} /></View>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Bản đã làm mượt</Text><Text style={styles.modeLabel}>{mode}</Text></View>
      {editing ? <TextInput value={result} onChangeText={setResult} multiline autoFocus style={styles.resultInput} /> : <View style={styles.result}><Text style={styles.resultText}>{result}</Text></View>}
      {applied ? <View style={styles.success}><Ionicons name="checkmark-circle" size={17} color="#507555" /><Text style={styles.successText}>Đã áp dụng vào bản đọc cục bộ.</Text></View> : null}
      <View style={styles.actions}><Pressable style={styles.secondary} onPress={regenerate}><Ionicons name="refresh" size={17} color="#8F1D3F" /><Text style={styles.secondaryText}>Tạo lại</Text></Pressable><Pressable style={styles.secondary} onPress={() => setEditing((value) => !value)}><Ionicons name={editing ? 'checkmark' : 'create-outline'} size={17} color="#8F1D3F" /><Text style={styles.secondaryText}>{editing ? 'Xong' : 'Chỉnh sửa'}</Text></Pressable></View>
      <Pressable style={styles.apply} onPress={() => { setEditing(false); setApplied(true); }}><Text style={styles.applyText}>Áp dụng</Text></Pressable><Pressable style={styles.cancel} onPress={() => router.back()}><Text style={styles.cancelText}>Hủy</Text></Pressable>
      <View style={styles.dictionaryHead}><Text style={styles.dictionaryTitle}>Từ điển truyện</Text><Text style={styles.dictionaryMeta}>Ưu tiên khi convert</Text></View>
      <View style={styles.dictionary}><DictionaryRow original="叶凡" translated="Diệp Phàm" /><DictionaryRow original="师尊" translated="Sư tôn" /><DictionaryRow original="灵气" translated="Linh khí" /></View>
    </ScrollView>
  </SafeAreaView>;
}

function DictionaryRow({ original, translated }: { original: string; translated: string }) { return <View style={styles.dictionaryRow}><Text style={styles.hanzi}>{original}</Text><Ionicons name="arrow-forward" size={14} color="#998C91" /><Text style={styles.translated}>{translated}</Text><Ionicons name="checkmark-circle-outline" size={17} color="#66806A" /></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' }, header: { height: 61, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E3D6D0', alignItems: 'center', justifyContent: 'center' }, headCopy: { flex: 1, marginLeft: 11 }, title: { color: '#291F23', fontSize: 18, fontWeight: '900' }, subtitle: { color: '#81757A', fontSize: 10, marginTop: 2 }, aiBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  page: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 700, alignSelf: 'center' }, eyebrow: { color: '#8F1D3F', fontSize: 9, letterSpacing: 1.2, fontWeight: '900', marginTop: 4 }, modes: { gap: 7, paddingVertical: 11, paddingRight: 12 }, mode: { borderWidth: 1, borderColor: '#D8CBC5', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 }, modeActive: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' }, modeText: { color: '#6B5F64', fontSize: 10, fontWeight: '800' }, modeTextActive: { color: '#FFFFFF' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 13, marginBottom: 8 }, sectionTitle: { color: '#33282D', fontSize: 14, fontWeight: '900' }, count: { color: '#95898E', fontSize: 9 }, modeLabel: { color: '#8F1D3F', fontSize: 9, fontWeight: '900' }, original: { borderLeftWidth: 3, borderLeftColor: '#C6B6BC', paddingVertical: 13, paddingHorizontal: 15, backgroundColor: '#F1E9E5' }, originalText: { color: '#6F6468', fontSize: 15, lineHeight: 23 }, transition: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 14 }, transitionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#DCCFC9' }, spark: { width: 31, height: 31, borderRadius: 16, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' }, result: { backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D4CE', padding: 16, minHeight: 91 }, resultText: { color: '#31272B', fontSize: 17, lineHeight: 26, fontFamily: 'Georgia' }, resultInput: { backgroundColor: '#FFFDFC', borderWidth: 1.5, borderColor: '#A64A67', padding: 16, minHeight: 105, color: '#31272B', fontSize: 16, lineHeight: 25, textAlignVertical: 'top' },
  success: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 }, successText: { color: '#507555', fontSize: 10, fontWeight: '700' }, actions: { flexDirection: 'row', gap: 9, marginTop: 14 }, secondary: { flex: 1, height: 43, borderRadius: 12, borderWidth: 1, borderColor: '#CDAEBA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, secondaryText: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' }, apply: { height: 48, borderRadius: 13, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center', marginTop: 10 }, applyText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, cancel: { alignItems: 'center', padding: 12 }, cancelText: { color: '#756A6F', fontSize: 11, fontWeight: '800' },
  dictionaryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 19, borderTopWidth: 1, borderTopColor: '#DED1CA' }, dictionaryTitle: { color: '#33282D', fontSize: 15, fontWeight: '900' }, dictionaryMeta: { color: '#8B7F84', fontSize: 9 }, dictionary: { marginTop: 8 }, dictionaryRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED2CB', gap: 12 }, hanzi: { width: 52, color: '#4A3E43', fontSize: 14 }, translated: { flex: 1, color: '#8F1D3F', fontSize: 13, fontWeight: '800' }
});
