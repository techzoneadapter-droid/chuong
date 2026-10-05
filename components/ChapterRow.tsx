import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { xianxia } from '../constants/xianxia';
import { Chapter } from '../types';

interface Props { chapter: Chapter; onPress: () => void; showDate?: boolean; }

export function ChapterRow({ chapter, onPress, showDate = true }: Props) {
  const earlyAccessActive = Boolean(
    chapter.access === 'vip' &&
    chapter.earlyAccessUntil &&
    new Date(chapter.earlyAccessUntil).getTime() > Date.now()
  );
  const earlyDate = earlyAccessActive && chapter.earlyAccessUntil
    ? new Date(chapter.earlyAccessUntil).toLocaleDateString('vi-VN')
    : '';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.number, chapter.isRead && styles.numberRead]}><Text style={styles.numberText}>{chapter.number}</Text></View>
      <View style={styles.main}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={[styles.title, chapter.isRead && styles.read]}>Chương {chapter.number} · {chapter.title}</Text>
          {chapter.access === 'vip' ? <View style={[styles.vip, earlyAccessActive && styles.early]}><Ionicons name={earlyAccessActive ? 'time-outline' : 'lock-closed'} size={8} color={earlyAccessActive ? xianxia.jadeDeep : xianxia.cinnabar} /><Text style={[styles.vipText, earlyAccessActive && styles.earlyText]}>{earlyAccessActive ? `TIÊN CƠ · miễn phí ${earlyDate}` : `VIP${chapter.priceCoins ? ` · ${chapter.priceCoins} Hạ Phẩm Linh Thạch` : ''}`}</Text></View> : null}
        </View>
        {showDate ? <Text style={styles.date}>{chapter.relativeDate}{chapter.isRead ? ' · Đã đọc' : ''}</Text> : null}
      </View>
      {chapter.isDownloaded ? <Ionicons name="checkmark-circle" size={17} color="#56785B" /> : <Ionicons name="chevron-forward" size={17} color="#9A9186" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, paddingVertical: 10, gap: 12 },
  pressed: { opacity: 0.62 },
  number: { width: 35, height: 35, borderRadius: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', alignItems: 'center', justifyContent: 'center' },
  numberRead: { backgroundColor: '#EEE7DB', borderColor: xianxia.line },
  numberText: { color: xianxia.jadeDeep, fontSize: 10, fontWeight: '900' },
  main: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { flexShrink: 1, color: xianxia.ink, fontSize: 13, fontWeight: '900' },
  read: { color: xianxia.muted, fontWeight: '700' },
  date: { color: xianxia.muted, fontSize: 9, marginTop: 5 },
  vip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#F2E4DF', borderWidth: 1, borderColor: '#E1C4BA', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7 },
  vipText: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900' },
  early: { backgroundColor: '#E7F0EA', borderColor: '#BCD0C1' },
  earlyText: { color: xianxia.jadeDeep },
});
