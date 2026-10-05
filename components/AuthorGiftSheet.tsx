import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { xianxia } from '../constants/xianxia';
import { AUTHOR_GIFT_OPTIONS, AuthorGiftKey, BookGiftSummary, getBookGiftSummary, sendAuthorGift } from '../services/gifts';
import { getWallet } from '../services/wallet';

type Props = {
  visible: boolean;
  onClose: () => void;
  bookId: string;
  bookTitle: string;
  authorName: string;
  userId: string;
  onGiftSent?: (summary: BookGiftSummary) => void;
  onOpenWallet?: () => void;
};

export function AuthorGiftSheet({
  visible,
  onClose,
  bookId,
  bookTitle,
  authorName,
  userId,
  onGiftSent,
  onOpenWallet,
}: Props) {
  const [selected, setSelected] = useState<AuthorGiftKey>('tien_dan');
  const [balance, setBalance] = useState<number | null>(null);
  const [summary, setSummary] = useState<BookGiftSummary>({ totalGifts: 0, totalCoins: 0 });
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const option = useMemo(
    () => AUTHOR_GIFT_OPTIONS.find((item) => item.key === selected) ?? AUTHOR_GIFT_OPTIONS[1],
    [selected],
  );

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setError('');
    setSuccess('');
    void Promise.all([
      getWallet(userId),
      getBookGiftSummary(bookId),
    ]).then(([wallet, giftSummary]) => {
      if (!active) return;
      setBalance(wallet.high_spirit_stones);
      setSummary(giftSummary);
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'Không thể tải thông tin quà tặng.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [bookId, userId, visible]);

  const send = async () => {
    if (sending || !option) return;
    setSending(true);
    setError('');
    setSuccess('');
    try {
      const result = await sendAuthorGift(bookId, option.key);
      setBalance(result.balanceCoins);
      const nextSummary = await getBookGiftSummary(bookId).catch(() => ({
        totalGifts: summary.totalGifts + 1,
        totalCoins: summary.totalCoins + result.amountCoins,
      }));
      setSummary(nextSummary);
      onGiftSent?.(nextSummary);
      setSuccess(`Đã tặng ${option.name} cho ${authorName}. Cảm ơn bạn đã ủng hộ tác giả!`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa thể gửi quà.');
    } finally {
      setSending(false);
    }
  };

  const enough = balance !== null && balance >= option.amount;

  return <BottomSheet visible={visible} title="Tặng quà tác giả" onClose={() => !sending && onClose()} scroll>
    <View style={styles.hero}>
      <View style={styles.heroIcon}><Ionicons name="gift-outline" size={24} color={xianxia.goldSoft} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.kicker}>ỦNG HỘ TÁC GIẢ</Text>
        <Text style={styles.heroTitle}>{authorName}</Text>
        <Text numberOfLines={1} style={styles.heroBook}>{bookTitle}</Text>
      </View>
    </View>

    <View style={styles.summary}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{summary.totalGifts}</Text>
        <Text style={styles.summaryLabel}>Lượt tặng</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{summary.totalCoins.toLocaleString('vi-VN')}</Text>
        <Text style={styles.summaryLabel}>Thượng Phẩm đã tặng</Text>
      </View>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{balance === null ? '—' : balance.toLocaleString('vi-VN')}</Text>
        <Text style={styles.summaryLabel}>Số dư Thượng Phẩm</Text>
      </View>
    </View>

    <Text style={styles.sectionTitle}>Chọn món quà</Text>
    <View style={styles.grid}>
      {AUTHOR_GIFT_OPTIONS.map((gift) => {
        const active = gift.key === selected;
        return <Pressable key={gift.key} onPress={() => { setSelected(gift.key); setError(''); setSuccess(''); }} style={[styles.gift, active && styles.giftActive]}>
          <View style={[styles.giftIcon, active && styles.giftIconActive]}><Ionicons name="gift-outline" size={19} color={active ? xianxia.goldSoft : xianxia.jadeDeep} /></View>
          <Text style={[styles.giftName, active && styles.giftNameActive]}>{gift.name}</Text>
          <Text style={[styles.giftAmount, active && styles.giftAmountActive]}>{gift.amount.toLocaleString('vi-VN')} Thượng Phẩm Linh Thạch</Text>
          <Text style={[styles.giftSub, active && styles.giftSubActive]}>{gift.subtitle}</Text>
        </Pressable>;
      })}
    </View>

    <View style={styles.policy}>
      <Ionicons name="shield-checkmark-outline" size={18} color={xianxia.jadeDeep} />
      <Text style={styles.policyText}>Quà tặng được ghi vào doanh thu tác giả theo chính sách chia sẻ đang hoạt động. Mỗi giao dịch được ghi sổ riêng và không thể tự sửa số dư.</Text>
    </View>

    {loading ? <Text style={styles.info}>Đang cập nhật số dư và thống kê…</Text> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {success ? <Text style={styles.success}>{success}</Text> : null}

    {!enough && onOpenWallet ? <Pressable onPress={onOpenWallet} style={styles.walletButton}>
      <Ionicons name="diamond-outline" size={17} color={xianxia.cinnabar} />
      <Text style={styles.walletButtonText}>Nạp thêm Thượng Phẩm Linh Thạch</Text>
    </Pressable> : null}

    <Pressable disabled={sending || loading || !enough} onPress={() => void send()} style={[styles.send, (sending || loading || !enough) && styles.disabled]}>
      <Ionicons name="sparkles-outline" size={18} color="#FFFDF8" />
      <Text style={styles.sendText}>{sending ? 'Đang gửi quà…' : `Tặng ${option.name} · ${option.amount} Thượng Phẩm Linh Thạch`}</Text>
    </Pressable>
    {!enough ? <Text style={styles.insufficient}>Số dư chưa đủ cho món quà đã chọn.</Text> : null}
  </BottomSheet>;
}

const styles = StyleSheet.create({
  hero: { minHeight: 82, borderRadius: 17, padding: 13, backgroundColor: '#27423B', borderWidth: 1, borderColor: '#4B675F', flexDirection: 'row', alignItems: 'center', gap: 11 },
  heroIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: xianxia.goldSoft, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: '#FFFDF8', fontSize: 16, fontWeight: '900', marginTop: 3 },
  heroBook: { color: 'rgba(255,253,248,.72)', fontSize: 8.5, marginTop: 3 },
  summary: { flexDirection: 'row', gap: 7, marginTop: 10 },
  summaryItem: { flex: 1, minHeight: 67, borderRadius: 13, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: xianxia.line, padding: 8, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { color: xianxia.jadeDeep, fontSize: 14, fontWeight: '900' },
  summaryLabel: { color: xianxia.muted, fontSize: 7, lineHeight: 10, textAlign: 'center', marginTop: 3, fontWeight: '700' },
  sectionTitle: { color: xianxia.ink, fontSize: 13, fontWeight: '900', marginTop: 17, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gift: { width: '48.5%', minHeight: 112, borderRadius: 15, padding: 11, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#DED3C5' },
  giftActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.gold },
  giftIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: xianxia.jadeMist, alignItems: 'center', justifyContent: 'center' },
  giftIconActive: { backgroundColor: 'rgba(229,209,163,.12)', borderWidth: 1, borderColor: 'rgba(229,209,163,.38)' },
  giftName: { color: xianxia.ink, fontSize: 11, fontWeight: '900', marginTop: 8 },
  giftNameActive: { color: '#FFFDF8' },
  giftAmount: { color: xianxia.cinnabar, fontSize: 9, fontWeight: '900', marginTop: 3 },
  giftAmountActive: { color: xianxia.goldSoft },
  giftSub: { color: xianxia.muted, fontSize: 7.5, lineHeight: 11, marginTop: 5 },
  giftSubActive: { color: 'rgba(255,253,248,.70)' },
  policy: { marginTop: 13, borderRadius: 13, padding: 11, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C7D7CC', flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  policyText: { flex: 1, color: xianxia.muted, fontSize: 8.5, lineHeight: 13 },
  info: { color: xianxia.muted, fontSize: 8.5, marginTop: 10 },
  error: { color: xianxia.danger, fontSize: 9, lineHeight: 13, backgroundColor: '#F7E7E5', borderRadius: 10, padding: 9, marginTop: 10 },
  success: { color: '#47704D', fontSize: 9, lineHeight: 13, backgroundColor: '#E9F2EB', borderRadius: 10, padding: 9, marginTop: 10 },
  walletButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#D8BEC5', backgroundColor: '#FFFDF8', marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  walletButtonText: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900' },
  send: { minHeight: 50, borderRadius: 14, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { color: '#FFFDF8', fontSize: 10.5, fontWeight: '900' },
  disabled: { opacity: .48 },
  insufficient: { color: xianxia.cinnabar, fontSize: 8, textAlign: 'center', marginTop: 6 },
});
