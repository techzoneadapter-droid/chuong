import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../components/Form';
import { useAuth } from '../contexts/AuthContext';
import { messageForError } from '../services/errors';
import { ReportReason, reportReasonLabel, submitReport } from '../services/moderation';

const reasons: ReportReason[] = ['copyright', 'plagiarism', 'spam', 'harassment', 'inappropriate', 'impersonation', 'other'];

export default function ReportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    bookId?: string;
    chapterId?: string;
    commentId?: string;
    authorId?: string;
    label?: string;
  }>();
  const [reason, setReason] = useState<ReportReason>('copyright');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const targetCount = useMemo(() => [params.bookId, params.chapterId, params.commentId, params.authorId].filter(Boolean).length, [params]);

  useEffect(() => {
    if (!user) router.replace('/auth/login');
  }, [router, user]);

  const send = async () => {
    if (!user || targetCount !== 1) return;
    setLoading(true); setMessage('');
    try {
      await submitReport({
        reporterId: user.id,
        reason,
        details,
        bookId: params.bookId,
        chapterId: params.chapterId,
        commentId: params.commentId,
        authorId: params.authorId,
      });
      setMessage('Đã gửi báo cáo. Đội ngũ CHƯƠNG sẽ xem xét nội dung này.');
      setTimeout(() => router.back(), 900);
    } catch (cause) {
      setMessage(messageForError(cause, 'Không thể gửi báo cáo.'));
    } finally {
      setLoading(false);
    }
  };

  return <FormScreen title="Báo cáo nội dung" subtitle={params.label ? `Đối tượng: ${params.label}` : 'Hãy cho CHƯƠNG biết vấn đề bạn gặp.'}>
    {targetCount !== 1 ? <FormMessage error>Liên kết báo cáo không hợp lệ.</FormMessage> : null}
    <Text style={styles.heading}>Lý do</Text>
    <View style={styles.chips}>
      {reasons.map((item) => <Pressable key={item} onPress={() => setReason(item)} style={[styles.chip, reason === item && styles.activeChip]}>
        <Text style={[styles.chipText, reason === item && styles.activeText]}>{reportReasonLabel(item)}</Text>
      </Pressable>)}
    </View>
    <FormField
      label="Chi tiết"
      value={details}
      onChangeText={setDetails}
      placeholder={reason === 'copyright' ? 'Mô tả tác phẩm gốc, chủ sở hữu quyền và phần nội dung bị vi phạm…' : 'Mô tả vấn đề để đội ngũ kiểm duyệt xử lý nhanh hơn…'}
      multiline
      maxLength={5000}
    />
    {message ? <FormMessage error={!message.startsWith('Đã gửi')}>{message}</FormMessage> : null}
    <PrimaryButton label="Gửi báo cáo" onPress={send} loading={loading} disabled={!user || targetCount !== 1} />
    <Text style={styles.note}>Không gửi báo cáo giả mạo hoặc lạm dụng hệ thống. Các khiếu nại bản quyền có thể cần bổ sung bằng chứng ở bước xác minh sau.</Text>
  </FormScreen>;
}

const styles = StyleSheet.create({
  heading: { color: '#45393E', fontSize: 12, fontWeight: '900', marginBottom: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { borderWidth: 1, borderColor: '#D8CBC5', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#FFFDFC' },
  activeChip: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' },
  chipText: { color: '#6E6166', fontSize: 11, fontWeight: '800' },
  activeText: { color: '#FFF' },
  note: { color: '#8B7F83', fontSize: 10, lineHeight: 16, marginTop: 13, textAlign: 'center' },
});
