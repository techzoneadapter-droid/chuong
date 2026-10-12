import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { showAdPrivacyOptions } from '../services/adConsent.native';
import { xianxia } from '../constants/xianxia';

export function AdPrivacyOptions() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <View style={{ marginTop: 18 }}>
    <Pressable accessibilityRole="button" disabled={busy} style={{ padding: 14 }} onPress={async () => {
      setBusy(true); setMessage('');
      try {
        if (!(await showAdPrivacyOptions())) setMessage('Hiện không có biểu mẫu lựa chọn quyền riêng tư quảng cáo cho khu vực của bạn.');
      } catch { setMessage('Không thể mở lựa chọn quảng cáo. Vui lòng thử lại.'); }
      finally { setBusy(false); }
    }}><Text style={{ color: xianxia.jadeDeep, fontWeight: '700' }}>{busy ? 'Đang mở…' : 'Lựa chọn quyền riêng tư quảng cáo'}</Text></Pressable>
    {message ? <Text style={{ color: xianxia.muted, paddingHorizontal: 14 }}>{message}</Text> : null}
  </View>;
}
