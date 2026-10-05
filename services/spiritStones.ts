export type SpiritCurrency = 'low' | 'high';
export const spiritCurrencyLabel = (currency: SpiritCurrency) => currency === 'high' ? 'Thượng Phẩm' : 'Hạ Phẩm';
export const premiumPrice = (lowPrice: number) => Math.ceil(Math.max(0, lowPrice) * 0.5);
