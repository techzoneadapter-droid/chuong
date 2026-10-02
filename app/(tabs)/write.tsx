import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WriteScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.page}>
        <Text style={styles.kicker}>AUTHOR STUDIO</Text>
        <Text style={styles.title}>Viết câu chuyện của bạn.</Text>
        <Text style={styles.body}>Tạo truyện, viết chương, quản lý bản nháp và theo dõi độc giả.</Text>
        <View style={styles.metrics}>
          {[
            ['23.541', 'Lượt đọc'],
            ['1.241', 'Theo dõi'],
            ['4', 'Truyện'],
            ['1,82tr', 'Doanh thu']
          ].map(([value, label]) => (
            <View style={styles.metric} key={label}>
              <Text style={styles.value}>{value}</Text>
              <Text style={styles.label}>{label}</Text>
            </View>
          ))}
        </View>
        <Pressable style={styles.button}>
          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>Viết chương mới</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  page: { padding: 16 },
  kicker: { color: '#8F1D3F', fontSize: 11, fontWeight: '900', letterSpacing: 1.3, marginTop: 10 },
  title: { color: '#221A1D', fontSize: 31, lineHeight: 38, fontWeight: '900', marginTop: 8, maxWidth: 330 },
  body: { color: '#756B6F', fontSize: 14, lineHeight: 21, marginTop: 9, maxWidth: 360 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 25 },
  metric: { width: '47%', padding: 16, backgroundColor: '#FFFDFC', borderRadius: 16, borderWidth: 1, borderColor: '#E9DDD6' },
  value: { color: '#221A1D', fontSize: 20, fontWeight: '900' },
  label: { color: '#756B6F', fontSize: 12, marginTop: 3 },
  button: { marginTop: 20, height: 52, borderRadius: 16, backgroundColor: '#8F1D3F', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }
});
