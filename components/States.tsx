import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function LoadingState({ label = 'Đang tải…' }: { label?: string }) {
  return <View style={styles.state}><ActivityIndicator color="#8F1D3F" /><Text style={styles.text}>{label}</Text></View>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <View style={styles.state}><Ionicons name="file-tray-outline" size={32} color="#A9989F" /><Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.text}>{detail}</Text> : null}</View>;
}

export function RetryState({ title = 'Không thể tải dữ liệu', detail, onRetry }: { title?: string; detail?: string; onRetry: () => void }) {
  return <View style={styles.state}><Ionicons name="cloud-offline-outline" size={32} color="#A9989F" /><Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.text}>{detail}</Text> : null}<Pressable onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Thử lại</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', justifyContent: 'center', padding: 34 },
  title: { color: '#302529', fontWeight: '900', fontSize: 16, marginTop: 10 },
  text: { color: '#756B6F', fontSize: 12, textAlign: 'center', marginTop: 6 },
  retry: { backgroundColor: '#F0E1E5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 13 },
  retryText: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' }
});
