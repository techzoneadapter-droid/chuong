import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Chapter } from '../types';

interface Props { chapter: Chapter; onPress: () => void; showDate?: boolean; }

export function ChapterRow({ chapter, onPress, showDate = true }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.number}><Text style={styles.numberText}>{chapter.number}</Text></View>
      <View style={styles.main}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={[styles.title, chapter.isRead && styles.read]}>Chương {chapter.number} · {chapter.title}</Text>
          {chapter.access === 'vip' ? <View style={styles.vip}><Ionicons name="lock-closed" size={9} color="#8F1D3F" /><Text style={styles.vipText}>VIP{chapter.priceCoins ? ` · ${chapter.priceCoins} Linh Thạch` : ''}</Text></View> : null}
        </View>
        {showDate ? <Text style={styles.date}>{chapter.relativeDate}{chapter.isRead ? ' · Đã đọc' : ''}</Text> : null}
      </View>
      {chapter.isDownloaded ? <Ionicons name="checkmark-circle" size={17} color="#56785B" /> : <Ionicons name="chevron-forward" size={17} color="#B1A5A9" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED2CB', paddingVertical: 10, gap: 12 },
  pressed: { opacity: 0.6 },
  number: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  numberText: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' },
  main: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { flexShrink: 1, color: '#221A1D', fontSize: 14, fontWeight: '800' },
  read: { color: '#746A6E', fontWeight: '600' },
  date: { color: '#8A8084', fontSize: 11, marginTop: 5 },
  vip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#F4E2E7', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  vipText: { color: '#8F1D3F', fontSize: 9, fontWeight: '900' }
});
