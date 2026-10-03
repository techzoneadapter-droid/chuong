import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { xianxia } from '../constants/xianxia';
import { artwork } from '../constants/artwork';

export function LoadingState({ label = 'Đang tải…' }: { label?: string }) {
  return <View style={styles.state}><View style={styles.emblem}><ActivityIndicator color={xianxia.jadeDeep} /></View><Text style={styles.text}>{label}</Text></View>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <View style={styles.state}><Image source={artwork.emptyLibrary} accessible={false} style={{ width: 148, height: 120, borderRadius: 8 }} /><Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.text}>{detail}</Text> : null}</View>;
}

export function RetryState({ title = 'Không thể tải dữ liệu', detail, onRetry }: { title?: string; detail?: string; onRetry: () => void }) {
  return <View style={styles.state}><View style={styles.emblem}><Ionicons name="cloud-offline-outline" size={25} color={xianxia.cinnabar} /></View><Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.text}>{detail}</Text> : null}<Pressable onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Thử lại</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', justifyContent: 'center', padding: 34 },
  emblem: { width: 50, height: 50, borderRadius: 16, backgroundColor: 'rgba(255,253,247,.84)', borderWidth: 1, borderColor: xianxia.line, alignItems: 'center', justifyContent: 'center' },
  title: { color: xianxia.ink, fontWeight: '900', fontSize: 16, marginTop: 10 },
  text: { color: xianxia.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  retry: { backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, marginTop: 13 },
  retryText: { color: xianxia.jadeDeep, fontSize: 10, fontWeight: '900' },
});
