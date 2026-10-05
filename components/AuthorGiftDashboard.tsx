import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { AuthorGiftDashboard as GiftData, getMyAuthorGifts } from '../services/gifts';
import { spiritCurrencyLabel } from '../services/spiritStones';

export function AuthorGiftDashboard() {
  const [data, setData] = useState<GiftData | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setData(await getMyAuthorGifts()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải quà tác giả.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <View style={{ padding: 16, marginVertical: 12, borderRadius: 16, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C5D5CA', gap: 8 }}>
    <Text style={{ fontWeight: '900', color: '#315247', fontSize: 16 }}>Quà độc giả</Text>
    {error ? <Pressable onPress={() => void load()}><Text>{error} · Thử lại</Text></Pressable> : data ? <>
      <Text style={{ color: '#315247', fontSize: 18, fontWeight: '800' }}>{Number(data.totalHigh).toLocaleString('vi-VN')} Thượng Phẩm</Text>
      {Number(data.totalLow) > 0 ? <Text>Quà trước nâng cấp: {Number(data.totalLow).toLocaleString('vi-VN')} Hạ Phẩm</Text> : null}
      {!data.recent.length ? <Text>Chưa có quà. Quà từ độc giả sẽ xuất hiện tại đây.</Text> : data.recent.map((gift) => <View key={gift.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#C5D5CA' }}>
        <Text>{Number(gift.amount_coins).toLocaleString('vi-VN')} {spiritCurrencyLabel(gift.currency_type)} · {gift.book_title ?? 'Quà tác giả'}</Text>
        <Text style={{ fontSize: 11, color: '#716965', marginTop: 4 }}>{new Date(gift.created_at).toLocaleString('vi-VN')}</Text>
      </View>)}
    </> : <Text>Đang tải quà…</Text>}
  </View>;
}
