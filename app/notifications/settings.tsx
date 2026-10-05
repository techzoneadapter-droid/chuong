import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import {
  defaultNotificationPreferences,
  getNotificationPreferences,
  NotificationPreferences,
  saveNotificationPreferences,
} from '../../services/notifications';
import {
  getPushCapability,
  getRegisteredPushDevices,
  PushCapability,
  registerCurrentDeviceForPush,
  unregisterCurrentPushDevice,
} from '../../services/pushNotifications';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [pushCapability, setPushCapability] = useState<PushCapability | null>(null);
  const [registeredDevices, setRegisteredDevices] = useState(0);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [nextPrefs, capability] = await Promise.all([
        getNotificationPreferences(),
        getPushCapability(),
      ]);
      setPrefs(nextPrefs);
      setPushCapability(capability);
      if (capability.supported) {
        setRegisteredDevices((await getRegisteredPushDevices()).length);
      } else {
        setRegisteredDevices(0);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải cài đặt thông báo.');
    } finally {
      setLoading(false);
    }
  }, [authLoading, router, user]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const update = async (key: keyof NotificationPreferences, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingKey(key);
    setError('');
    setSaved('');
    try {
      await saveNotificationPreferences(next);
      setSaved('Đã lưu');
    } catch (cause) {
      setPrefs(prefs);
      setError(cause instanceof Error ? cause.message : 'Không thể lưu cài đặt.');
    } finally {
      setSavingKey('');
    }
  };

  const updatePush = async (value: boolean) => {
    const previous = prefs;
    setSavingKey('pushEnabled');
    setError('');
    setSaved('');
    try {
      if (value) {
        if (!pushCapability?.supported) {
          throw new Error(pushCapability?.reason || 'Build hiện tại chưa hỗ trợ push.');
        }
        await registerCurrentDeviceForPush({ requestPermission: true });
        const next = { ...prefs, inAppEnabled: true, pushEnabled: true };
        await saveNotificationPreferences(next);
        setPrefs(next);
        setSaved('Đã bật push trên thiết bị này.');
      } else {
        const next = { ...prefs, pushEnabled: false };
        await saveNotificationPreferences(next);
        setPrefs(next);
        await unregisterCurrentPushDevice().catch(() => false);
        setSaved('Đã tắt push.');
      }
      const capability = await getPushCapability();
      setPushCapability(capability);
      setRegisteredDevices(capability.supported ? (await getRegisteredPushDevices()).length : 0);
    } catch (cause) {
      setPrefs(previous);
      setError(cause instanceof Error ? cause.message : 'Không thể thay đổi push notification.');
    } finally {
      setSavingKey('');
    }
  };

  if (authLoading || loading) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải cài đặt thông báo…" /></SafeAreaView>;
  if (!user) return null;
  if (error && loading) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color="#2D2327" />
      </Pressable>
      <Text style={styles.topTitle}>Cài đặt thông báo</Text>
      <View style={styles.iconButton} />
    </View>

    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={styles.saved}>{saved}</Text> : null}

      <View style={styles.master}>
        <View style={styles.masterIcon}><Ionicons name="notifications-outline" size={24} color="#8F1D3F" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.masterTitle}>Thông báo trong CHƯƠNG</Text>
          <Text style={styles.masterBody}>Tắt mục này sẽ ngừng tạo thông báo mới trong Inbox. Thông báo cũ vẫn được giữ.</Text>
        </View>
        <Switch
          value={prefs.inAppEnabled}
          onValueChange={(value) => { void update('inAppEnabled', value); }}
          disabled={Boolean(savingKey)}
          trackColor={{ false: '#D7CCCF', true: '#C98DA1' }}
          thumbColor={prefs.inAppEnabled ? '#8F1D3F' : '#F6F1F2'}
        />
      </View>

      <Text style={styles.sectionTitle}>Loại thông báo</Text>
      <View style={styles.card}>
        <PreferenceRow icon="diamond-outline" title="Hạ Phẩm · Thượng Phẩm & giao dịch" body="Nạp, hoàn, thu hồi và khôi phục giao dịch." value={prefs.purchases} disabled={!prefs.inAppEnabled || Boolean(savingKey)} onChange={(value) => { void update('purchases', value); }} />
        <PreferenceRow icon="stats-chart-outline" title="Doanh thu tác giả" body="Doanh thu mới và điều chỉnh hoàn tiền." value={prefs.authorEarnings} disabled={!prefs.inAppEnabled || Boolean(savingKey)} onChange={(value) => { void update('authorEarnings', value); }} />
        <PreferenceRow icon="cash-outline" title="Thanh toán tác giả" body="Yêu cầu rút được duyệt, hủy hoặc đã thanh toán." value={prefs.payouts} disabled={!prefs.inAppEnabled || Boolean(savingKey)} onChange={(value) => { void update('payouts', value); }} />
        <PreferenceRow icon="chatbubble-ellipses-outline" title="Bình luận" body="Trả lời bình luận và bình luận mới trên truyện của bạn." value={prefs.comments} disabled={!prefs.inAppEnabled || Boolean(savingKey)} onChange={(value) => { void update('comments', value); }} />
        <PreferenceRow icon="shield-checkmark-outline" title="Kiểm duyệt" body="Trạng thái nội dung, báo cáo và quyết định kiểm duyệt." value={prefs.moderation} disabled={!prefs.inAppEnabled || Boolean(savingKey)} onChange={(value) => { void update('moderation', value); }} />
        <PreferenceRow icon="book-outline" title="Chương mới" body="Báo khi truyện bạn theo dõi vừa xuất bản chương mới, kể cả chương đăng theo lịch." value={prefs.newChapters} disabled={!prefs.inAppEnabled || Boolean(savingKey)} onChange={(value) => { void update('newChapters', value); }} />
        <PreferenceRow icon="sparkles-outline" title="Hệ thống CHƯƠNG" body="Thông báo vận hành quan trọng từ nền tảng." value={prefs.system} disabled={!prefs.inAppEnabled || Boolean(savingKey)} onChange={(value) => { void update('system', value); }} last />
      </View>

      <Text style={styles.sectionTitle}>Push Android / iOS</Text>
      <View style={styles.pushCard}>
        <View style={styles.pushIcon}><Ionicons name="phone-portrait-outline" size={22} color="#8F1D3F" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pushTitle}>Push notification</Text>
          <Text style={styles.pushBody}>
            {pushCapability?.supported
              ? (prefs.pushEnabled
                ? 'Đang bật · ' + registeredDevices + ' thiết bị đã đăng ký. Thông báo mới sẽ được gửi qua Expo Push → FCM/APNs.'
                : 'Build này đã sẵn sàng. Bật để xin quyền hệ thống và đăng ký thiết bị.')
              : (pushCapability?.reason || 'Đang kiểm tra khả năng push…')}
          </Text>
        </View>
        <Switch
          value={prefs.pushEnabled}
          onValueChange={(value) => { void updatePush(value); }}
          disabled={!pushCapability?.supported || Boolean(savingKey)}
          trackColor={{ false: '#D7CCCF', true: '#C98DA1' }}
          thumbColor={prefs.pushEnabled ? '#8F1D3F' : '#F6F1F2'}
        />
      </View>
      <View style={styles.pushHint}>
        <Ionicons name="shield-checkmark-outline" size={17} color="#8F1D3F" />
        <Text style={styles.pushHintText}>Push chỉ được gửi cho sự kiện đã có trong Inbox. Tắt từng nhóm ở trên cũng đồng thời tắt push của nhóm đó.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function PreferenceRow({
  icon,
  title,
  body,
  value,
  disabled,
  onChange,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) {
  return <View style={[styles.row, !last && styles.rowBorder]}>
    <View style={styles.rowIcon}><Ionicons name={icon} size={19} color="#8F1D3F" /></View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowBody}>{body}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: '#D7CCCF', true: '#C98DA1' }}
      thumbColor={value ? '#8F1D3F' : '#F6F1F2'}
    />
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  page: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  error: { color: '#A12B48', backgroundColor: '#F8E7EC', padding: 10, borderRadius: 10, fontSize: 10, marginBottom: 10 },
  saved: { color: '#47704D', backgroundColor: '#EDF4EC', padding: 10, borderRadius: 10, fontSize: 10, marginBottom: 10 },
  master: { minHeight: 96, backgroundColor: '#FFFDFC', borderRadius: 18, borderWidth: 1, borderColor: '#E4D8D1', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  masterIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  masterTitle: { color: '#2D2327', fontSize: 13, fontWeight: '900' },
  masterBody: { color: '#81757A', fontSize: 9, lineHeight: 14, marginTop: 4 },
  sectionTitle: { color: '#2C2226', fontSize: 17, fontWeight: '900', marginTop: 22, marginBottom: 9 },
  card: { backgroundColor: '#FFFDFC', borderRadius: 18, borderWidth: 1, borderColor: '#E4D8D1', overflow: 'hidden' },
  row: { minHeight: 78, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4D8D1' },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: '#30262A', fontSize: 11, fontWeight: '900' },
  rowBody: { color: '#85787D', fontSize: 9, lineHeight: 14, marginTop: 3 },
  pushCard: { minHeight: 105, backgroundColor: '#FFFDFC', borderRadius: 18, borderWidth: 1, borderColor: '#E4D8D1', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  pushIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  pushTitle: { color: '#30262A', fontSize: 12, fontWeight: '900' },
  pushBody: { color: '#85787D', fontSize: 9, lineHeight: 14, marginTop: 4 },
  pushHint: { marginTop: 9, borderRadius: 13, backgroundColor: '#F0E1E5', padding: 11, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  pushHintText: { flex: 1, color: '#65575D', fontSize: 9, lineHeight: 14 },
});
