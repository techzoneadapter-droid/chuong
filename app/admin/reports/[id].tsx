import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../../components/States';
import { useAuth } from '../../../contexts/AuthContext';
import { adminModerate, adminUpdateReport, getAdminReport, getReportTarget, ModerationState, ReportRow, reportReasonLabel, reportStatusLabel } from '../../../services/moderation';

export default function AdminReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [report, setReport] = useState<ReportRow | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target = useMemo(() => report ? getReportTarget(report) : null, [report]);

  const load = async () => {
    setLoading(true); setError('');
    try { const data = await getAdminReport(id); setReport(data); setNote(data.resolution_note ?? ''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải báo cáo.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (profile?.role === 'admin') void load(); }, [id, profile?.role]);

  const moderate = async (state: ModerationState) => {
    if (!target || !report) return;
    setBusy(true);
    try {
      await adminModerate(target.type, target.id, state, note, report.id);
      if (report.status === 'open') await adminUpdateReport(report.id, 'reviewing', note);
      await load();
    } catch (cause) { Alert.alert('Không thể kiểm duyệt', cause instanceof Error ? cause.message : 'Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };

  const finish = async (status: 'resolved' | 'rejected') => {
    if (!report) return;
    setBusy(true);
    try { await adminUpdateReport(report.id, status, note); await load(); }
    catch (cause) { Alert.alert('Không thể cập nhật', cause instanceof Error ? cause.message : 'Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };

  if (profile?.role !== 'admin') return <SafeAreaView style={styles.safe}><RetryState detail="Bạn không có quyền quản trị." onRetry={() => router.back()} /></SafeAreaView>;
  if (loading) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải báo cáo…" /></SafeAreaView>;
  if (error || !report) return <SafeAreaView style={styles.safe}><RetryState detail={error || 'Không tìm thấy báo cáo.'} onRetry={load} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.top}><Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={23} color="#2D2327" /></Pressable><Text style={styles.title}>Chi tiết báo cáo</Text><View style={{ width: 23 }} /></View>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.badges}><Text style={styles.reason}>{reportReasonLabel(report.reason)}</Text><Text style={styles.status}>{reportStatusLabel(report.status)}</Text></View>
      <Text style={styles.label}>Đối tượng</Text><Text style={styles.value}>{target ? `${target.type} · ${target.id}` : 'Không xác định'}</Text>
      <Text style={styles.label}>Nội dung báo cáo</Text><Text style={styles.body}>{report.details || 'Không có mô tả bổ sung.'}</Text>
      <Text style={styles.label}>Ghi chú xử lý</Text>
      <TextInput value={note} onChangeText={setNote} multiline maxLength={5000} placeholder="Ghi lý do, kết luận hoặc thông tin cần lưu…" placeholderTextColor="#9C9094" style={styles.input} />
      <Text style={styles.section}>Kiểm duyệt nội dung</Text>
      <View style={styles.actionGrid}>
        <Action label="Khôi phục / Duyệt" icon="checkmark-circle-outline" onPress={() => moderate('approved')} disabled={busy} />
        <Action label="Ẩn nội dung" icon="eye-off-outline" onPress={() => moderate('hidden')} disabled={busy} danger />
        <Action label="Từ chối nội dung" icon="close-circle-outline" onPress={() => moderate('rejected')} disabled={busy} danger />
      </View>
      <Text style={styles.section}>Kết thúc báo cáo</Text>
      <Pressable disabled={busy} onPress={() => finish('resolved')} style={styles.primary}><Text style={styles.primaryText}>Đánh dấu đã xử lý</Text></Pressable>
      <Pressable disabled={busy} onPress={() => finish('rejected')} style={styles.secondary}><Text style={styles.secondaryText}>Kết luận không vi phạm</Text></Pressable>
      <Text style={styles.meta}>Tạo lúc {new Date(report.created_at).toLocaleString('vi-VN')}</Text>
    </ScrollView>
  </SafeAreaView>;
}

function Action({ label, icon, onPress, disabled, danger }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, danger && styles.danger, disabled && { opacity: .45 }]}><Ionicons name={icon} size={20} color={danger ? '#9B2946' : '#4E714F'} /><Text style={[styles.actionText, danger && { color: '#9B2946' }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  top: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  title: { color: '#221A1D', fontSize: 18, fontWeight: '900' },
  page: { padding: 18, paddingBottom: 45, width: '100%', maxWidth: 720, alignSelf: 'center' },
  badges: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  reason: { color: '#8F1D3F', fontSize: 16, fontWeight: '900', flex: 1 },
  status: { color: '#62565B', fontSize: 10, fontWeight: '800', backgroundColor: '#F0E7E3', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  label: { color: '#8A7D82', fontSize: 10, fontWeight: '900', letterSpacing: .7, marginTop: 20, textTransform: 'uppercase' },
  value: { color: '#33282D', fontSize: 13, lineHeight: 20, marginTop: 5 },
  body: { color: '#5D5156', fontSize: 13, lineHeight: 21, marginTop: 6 },
  input: { minHeight: 110, marginTop: 8, borderWidth: 1, borderColor: '#D9CCC5', backgroundColor: '#FFFDFC', borderRadius: 14, padding: 13, color: '#33282D', textAlignVertical: 'top' },
  section: { color: '#221A1D', fontSize: 15, fontWeight: '900', marginTop: 24, marginBottom: 10 },
  actionGrid: { gap: 9 },
  action: { minHeight: 48, borderWidth: 1, borderColor: '#C9DBC9', backgroundColor: '#F1F6F0', borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  danger: { borderColor: '#E1B8C4', backgroundColor: '#F8EAEE' },
  actionText: { color: '#4E714F', fontSize: 12, fontWeight: '900' },
  primary: { height: 50, backgroundColor: '#8F1D3F', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  secondary: { height: 48, borderWidth: 1, borderColor: '#8F1D3F', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  secondaryText: { color: '#8F1D3F', fontWeight: '900', fontSize: 13 },
  meta: { color: '#9A8E92', fontSize: 9, textAlign: 'center', marginTop: 18 },
});
