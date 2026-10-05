import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { formatVnd, getVndPolicies, saveVndPolicy, settleVndPeriod, VndPolicy } from '../../services/vndRevenue';

const fields = [
 ['rate', 'Giá trị Thượng Phẩm (VND) (để trống nếu chưa cấu hình)'],
 ['chapter', 'Tác giả nhận từ mở khóa chương (%)'], ['book', 'Tác giả nhận từ mở khóa cả truyện (%)'], ['gift', 'Tác giả nhận từ quà (%)'],
 ['pool', 'Pool tác giả từ Hạ Phẩm (%)'], ['minimum', 'Rút tối thiểu (VND)'], ['fee', 'Phí rút (VND)'],
] as const;
type Fields = Record<typeof fields[number][0], string>;
const initial: Fields = { rate: '', chapter: '60', book: '60', gift: '80', pool: '60', minimum: '1', fee: '0' };
export default function AdminMonetizationScreen() {
 const router = useRouter();
 const { profile, loading } = useAuth();
 const [policies, setPolicies] = useState<VndPolicy[]>([]);
 const [form, setForm] = useState(initial);
 const [message, setMessage] = useState('');
 const [busy, setBusy] = useState(false);
 const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [pool, setPool] = useState('');
 const load = async () => {
  const rows = await getVndPolicies(); setPolicies(rows);
  const p = rows[0];
  if (p) setForm({ rate: p.high_stone_value_vnd == null ? '' : String(p.high_stone_value_vnd), chapter: String(p.chapter_author_bps / 100), book: String(p.book_author_bps / 100), gift: String(p.gift_author_bps / 100), pool: String(p.low_creator_pool_bps / 100), minimum: String(p.minimum_withdrawal_vnd), fee: String(p.withdrawal_fee_vnd) });
 };
 useEffect(() => {
  if (!loading && profile?.role !== 'admin') router.replace('/(tabs)/profile');
  if (profile?.role === 'admin') void load().catch(e => setMessage(e.message));
 }, [loading, profile?.role]);
 const run = async (action: () => Promise<void>) => {
  setBusy(true); setMessage('');
  try { await action(); setMessage('Đã lưu.'); await load(); }
  catch (e) { setMessage(e instanceof Error ? e.message : 'Không thể lưu.'); }
  finally { setBusy(false); }
 };
 const save = () => run(async () => {
  const money = (value: string, positive: boolean) => {
   if (!/^\d+$/.test(value)) throw new Error('Nhập số tiền VND nguyên.');
   const n = Number(value); if (!Number.isSafeInteger(n) || n < (positive ? 1 : 0)) throw new Error('Số tiền VND không hợp lệ.'); return n;
  };
  const percent = (value: string) => {
   const n = Number(value.replace(',', '.')); const bps = Math.round(n * 100);
   if (!value.trim() || !Number.isFinite(n) || n < 0 || n > 100) throw new Error('Tỷ lệ phải từ 0 đến 100%.'); return bps;
  };
  await saveVndPolicy({ high_stone_value_vnd: form.rate.trim() ? money(form.rate, true) : null, chapter_author_bps: percent(form.chapter), book_author_bps: percent(form.book), gift_author_bps: percent(form.gift), low_creator_pool_bps: percent(form.pool), minimum_withdrawal_vnd: money(form.minimum, true), withdrawal_fee_vnd: money(form.fee, false) });
 });
 const settle = () => run(async () => {
  const a = new Date(start); const b = new Date(end); const n = Number(pool);
  if (!start || !end || !Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b <= a || !Number.isSafeInteger(n) || n <= 0) throw new Error('Nhập kỳ UTC hợp lệ và pool VND nguyên lớn hơn 0.');
  await settleVndPeriod(a.toISOString(), b.toISOString(), n);
 });
 if (loading || profile?.role !== 'admin') return null;
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
  <Pressable onPress={() => router.back()}><Text style={styles.link}>← Quản trị</Text></Pressable>
  <Text style={styles.title}>Chính sách thanh toán VND</Text>
  <Text style={styles.warning}>Thay đổi chỉ áp dụng cho giao dịch mới. Doanh thu cũ giữ nguyên giá trị đã chốt.</Text>
  <Text style={styles.body}>App VIP: tác giả 0%. Mỗi phiên bản ghi người thay đổi và thời gian. Không tự quy đổi Hạ Phẩm thành VND.</Text>
  {message ? <Text accessibilityRole="alert" style={styles.warning}>{message}</Text> : null}
  {fields.map(([key, label]) => <View key={key}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} keyboardType="decimal-pad" style={styles.input} value={form[key]} onChangeText={v => setForm(prev => ({ ...prev, [key]: v }))} /></View>)}
  <Pressable disabled={busy} onPress={save} style={[styles.button, busy && { opacity: .5 }]}><Text style={styles.buttonText}>{busy ? 'Đang lưu…' : 'Lưu phiên bản chính sách mới'}</Text></Pressable>
  <Text style={styles.title}>Đối soát Hạ Phẩm</Text>
  <Text style={styles.body}>Phân bổ pool thực tế theo tỷ trọng Hạ Phẩm đã sử dụng trong kỳ. Mỗi giao dịch được đối soát một lần; các khoản đã hoàn được loại trừ.</Text>
  <Text style={styles.label}>Từ (UTC, ví dụ 2026-10-01T00:00:00Z)</Text><TextInput style={styles.input} value={start} onChangeText={setStart} autoCapitalize="none" />
  <Text style={styles.label}>Đến (UTC, không bao gồm thời điểm này)</Text><TextInput style={styles.input} value={end} onChangeText={setEnd} autoCapitalize="none" />
  <Text style={styles.label}>Doanh thu pool thực tế (VND)</Text><TextInput style={styles.input} value={pool} onChangeText={setPool} keyboardType="number-pad" />
  <Pressable disabled={busy} onPress={settle} style={styles.button}><Text style={styles.buttonText}>Chốt đối soát kỳ</Text></Pressable>
  <Text style={styles.title}>Lịch sử chính sách</Text>
  {policies.map(p => <View key={p.id} style={styles.card}>
   <Text style={styles.label}>{new Date(p.created_at).toLocaleString('vi-VN')}</Text>
   <Text style={styles.body}>{p.high_stone_value_vnd == null ? 'Chưa cấu hình tỷ giá thanh toán' : `${formatVnd(p.high_stone_value_vnd)} / Thượng Phẩm`}</Text>
   <Text style={styles.body}>Chương {p.chapter_author_bps / 100}% · Truyện {p.book_author_bps / 100}% · Quà {p.gift_author_bps / 100}% · Pool {p.low_creator_pool_bps / 100}%</Text>
   <Text style={styles.body}>Người thay đổi: {p.created_by ?? 'Khởi tạo hệ thống'}</Text>
  </View>)}
 </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
 safe: { flex: 1, backgroundColor: '#F8F2E9' }, page: { padding: 20, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
 title: { fontSize: 22, fontWeight: '900', color: '#2D2327', marginVertical: 16 }, link: { color: '#8F1D3F', paddingVertical: 12 },
 warning: { backgroundColor: '#F0E1E5', color: '#741632', padding: 14, borderRadius: 12, lineHeight: 22, marginVertical: 8 },
 body: { color: '#65575D', lineHeight: 21 }, label: { color: '#2D2327', fontWeight: '700', marginTop: 14, marginBottom: 6 },
 input: { backgroundColor: '#FFFDFC', borderColor: '#DDD0C9', borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 14, color: '#2D2327' },
 button: { backgroundColor: '#8F1D3F', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 18 }, buttonText: { color: '#FFF', fontWeight: '800' },
 card: { backgroundColor: '#FFFDFC', padding: 14, borderRadius: 12, marginBottom: 12 },
});
