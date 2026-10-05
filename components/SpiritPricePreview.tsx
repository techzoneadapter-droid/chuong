import { Text } from 'react-native';
import { premiumPrice } from '../services/spiritStones';

export function SpiritPricePreview({ lowPrice }: { lowPrice: number }) {
  return <Text style={{ color: '#315247', fontSize: 12, lineHeight: 18, marginVertical: 10 }}>
    Giá Thượng Phẩm: {premiumPrice(lowPrice).toLocaleString('vi-VN')} · 50% Hạ Phẩm (làm tròn lên)
  </Text>;
}
