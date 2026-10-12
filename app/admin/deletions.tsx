import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../../components/Form';
import { useAuth } from '../../contexts/AuthContext';
import { requireSupabase } from '../../lib/supabase';

type RequestRow = { id: string; user_id: string; status: string; requested_at: string; policy_version: string | null };
const steps = ['retention_review','wallet_and_payout_review','ugc_and_rights','personal_data','storage','devices_and_providers','auth_sessions','completion_notice'];
export default function DeletionsScreen() {
  const { profile } = useAuth();
  const [items, setItems] = useState<RequestRow[]>([]);
  const [selected, setSelected] = useState('');
  const [token, setToken] = useState<string>();
  const [step, setStep] = useState(steps[0]);
  const [evidence, setEvidence] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data, error } = await requireSupabase().rpc('admin_deletion_queue');
    if (error) throw error;
    setItems((data ?? []) as RequestRow[]);
  };
  useEffect(() => { if (profile?.role === 'admin') void load().catch(() => setMessage('Không thể tải hàng đợi. Kiểm tra migration staging.')); }, [profile?.role]);
  const action = async (id: string, name: string) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const { data, error } = await requireSupabase().rpc('admin_deletion_action', { p_id: id, p_action: name, p_token: token, p_step: step, p_evidence: evidence });
      if (error) throw error;
      const result = data as { token?: string };
      if (name === 'claim') { setSelected(id); setToken(result.token); }
      if (name === 'block' || name === 'complete') { setSelected(''); setToken(undefined); }
      setMessage('Đã ghi nhận thao tác. Không có dữ liệu người dùng bị xóa bởi giao diện này.');
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Thao tác chưa được xác nhận.'); }
    finally { setBusy(false); }
  };
  return <FormScreen title="Yêu cầu xóa tài khoản" backHref="/admin" subtitle="Hàng đợi vận hành có lease 30 phút và bằng chứng từng bước.">
    {profile?.role !== 'admin' ? <FormMessage error>Bạn không có quyền quản trị.</FormMessage> : <>
      <FormMessage>Chỉ xử lý theo chính sách đã được chủ sở hữu phê duyệt. Không xóa auth trực tiếp: dữ liệu tài chính, tác giả và bản quyền phải được rà soát. Không ghi email, biên lai, khóa API hoặc dữ liệu ngân hàng vào bằng chứng; dùng mã hồ sơ nội bộ.</FormMessage>
      {message ? <FormMessage>{message}</FormMessage> : null}
      <PrimaryButton label="Cập nhật hàng đợi" onPress={() => { void load().catch(() => setMessage('Không thể tải hàng đợi.')); }} />
      {items.map(item => <View key={item.id} style={{ gap: 8, paddingVertical: 16 }}>
        <Text>{item.id} · {item.status}</Text><Text>Yêu cầu: {new Date(item.requested_at).toLocaleString('vi-VN')}</Text>
        <Text>Chính sách đã duyệt: {item.policy_version || 'Chưa có — chưa thể hoàn tất'}</Text>
        {item.status !== 'completed' && selected !== item.id ? <PrimaryButton label="Nhận xử lý" disabled={busy} onPress={() => { void action(item.id, 'claim'); }} /> : null}
        {selected === item.id && token ? <>
          <FormField label={'Bước: ' + steps.join(', ')} value={step} onChangeText={setStep} />
          <FormField label="Mã bằng chứng / kết quả đã kiểm chứng" value={evidence} onChangeText={setEvidence} multiline />
          <PrimaryButton label="Ghi nhận bước đã xử lý" disabled={busy || !steps.includes(step) || evidence.trim().length < 10} onPress={() => { void action(item.id, 'record'); }} />
          <PrimaryButton label="Chuyển chờ rà soát" disabled={busy} onPress={() => { void action(item.id, 'block'); }} />
          <PrimaryButton label="Xác nhận hoàn tất" disabled={busy || !item.policy_version} onPress={() => { void action(item.id, 'complete'); }} />
        </> : null}
      </View>)}
    </>}
  </FormScreen>;
}
