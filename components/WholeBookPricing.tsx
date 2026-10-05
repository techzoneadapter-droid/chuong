import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Book } from '../types';
import { updateBook } from '../services/books';
import { SpiritPricePreview } from './SpiritPricePreview';

// Editors share one Hạ Phẩm input; the existing unlock RPC derives the premium price.
export function WholeBookPricing({ book, onSaved }: { book: Book; onSaved: () => Promise<void> }) {
 const [paid, setPaid] = useState(book.isVip);
 const [price, setPrice] = useState(String(book.price ?? 0));
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState('');
 useEffect(() => { setPaid(book.isVip); setPrice(String(book.price ?? 0)); }, [book.id, book.isVip, book.price]);
 const save = async () => {
  const amount = Number(price);
  if (paid && (!Number.isSafeInteger(amount) || amount <= 0)) return setMessage('Nhập giá Hạ Phẩm nguyên lớn hơn 0.');
  setBusy(true); setMessage('');
  try {
   await updateBook(book.id, { is_vip: paid, price_coins: paid ? amount : 0 });
   setMessage('Đã lưu giá cho lượt mua mới.'); await onSaved();
  } catch (e) { setMessage(e instanceof Error ? e.message : 'Không thể lưu giá.'); }
  finally { setBusy(false); }
 };
 return <View style={styles.card}>
  <Text style={styles.title}>Giá mở khóa cả truyện</Text>
  <View style={styles.row}><Text style={styles.label}>Bán quyền đọc cả truyện</Text><Switch accessibilityLabel="Bán quyền đọc cả truyện" value={paid} onValueChange={setPaid} disabled={busy} /></View>
  {paid ? <><Text style={styles.label}>Giá Hạ Phẩm</Text><TextInput accessibilityLabel="Giá cả truyện Hạ Phẩm" keyboardType="number-pad" style={styles.input} value={price} onChangeText={v => setPrice(v.replace(/\D/g, ''))} editable={!busy} /><SpiritPricePreview lowPrice={Number(price) || 0} /></> : null}
  <Text style={styles.help}>Giá mới áp dụng cho lượt mua mới. Quyền đọc đã mua được giữ nguyên.</Text>
  {message ? <Text accessibilityRole="alert" style={styles.help}>{message}</Text> : null}
  <Pressable disabled={busy} onPress={save} style={[styles.button, busy && { opacity: .5 }]}><Text style={styles.buttonText}>{busy ? 'Đang lưu…' : 'Lưu giá cả truyện'}</Text></Pressable>
 </View>;
}
const styles = StyleSheet.create({
 card: { marginVertical: 16, backgroundColor: '#FFFDFC', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#DDD0C9' },
 title: { fontSize: 17, fontWeight: '900', color: '#2D2327' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginVertical: 10 },
 label: { color: '#463B40', fontWeight: '700', marginVertical: 6 }, input: { backgroundColor: '#F8F2E9', borderRadius: 12, minHeight: 48, paddingHorizontal: 12, color: '#2D2327' },
 help: { color: '#756B6F', lineHeight: 20, marginVertical: 8 }, button: { minHeight: 46, backgroundColor: '#8F1D3F', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 }, buttonText: { color: '#FFF', fontWeight: '800' },
});
