import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { ReaderPrivacy, getMyReaderPrivacy, updateReaderPrivacy } from '../../services/community';

export default function ReaderPrivacyScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<ReaderPrivacy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setSettings(await getMyReaderPrivacy());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải quyền riêng tư.');
    } finally {
      setLoading(false);
    }
  }, [authLoading, router, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const set = (key: keyof Pick<ReaderPrivacy, 'profilePublic' | 'showShelves' | 'showReviews' | 'showComments' | 'allowFollows'>, value: boolean) => {
    setSaved(false);
    setSettings((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!settings || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const next = await updateReaderPrivacy({
        profilePublic: settings.profilePublic,
        showShelves: settings.showShelves,
        showReviews: settings.showReviews,
        showComments: settings.showComments,
        allowFollows: settings.allowFollows,
      });
      setSettings(next);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu quyền riêng tư.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || authLoading) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải quyền riêng tư…" /></SafeAreaView>;
  if (error && !settings) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => { void load(); }} /></SafeAreaView>;
  if (!settings) return null;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <Text style={styles.topTitle}>Quyền riêng tư</Text>
      <View style={styles.iconButton} />
    </View>

    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="shield-checkmark-outline" size={25} color="#8F1D3F" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Bạn quyết định điều gì được công khai</Text>
          <Text style={styles.heroBody}>Tiến độ đọc, lịch sử đọc chi tiết, dấu trang và truyện “Đang đọc” luôn được giữ riêng tư.</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={styles.saved}>Đã lưu quyền riêng tư.</Text> : null}

      <View style={styles.card}>
        <SettingRow
          icon="person-circle-outline"
          title="Hồ sơ công khai"
          detail="Cho phép người khác mở hồ sơ độc giả của bạn."
          value={settings.profilePublic}
          onChange={(value) => set('profilePublic', value)}
        />
        <SettingRow
          icon="library-outline"
          title="Hiện kệ sách công khai"
          detail="Chỉ chia sẻ truyện Yêu thích và Đã hoàn thành. Không chia sẻ truyện đang đọc."
          value={settings.showShelves && settings.profilePublic}
          disabled={!settings.profilePublic}
          onChange={(value) => set('showShelves', value)}
        />
        <SettingRow
          icon="star-outline"
          title="Hiện đánh giá trên hồ sơ"
          detail="Đánh giá vẫn có thể xuất hiện ở trang truyện; tùy chọn này chỉ kiểm soát hồ sơ và bảng tin cộng đồng."
          value={settings.showReviews && settings.profilePublic}
          disabled={!settings.profilePublic}
          onChange={(value) => set('showReviews', value)}
        />
        <SettingRow
          icon="chatbubble-outline"
          title="Hiện bình luận trên hồ sơ"
          detail="Bình luận vẫn có thể xuất hiện tại truyện/chương; tùy chọn này kiểm soát hồ sơ và bảng tin cộng đồng."
          value={settings.showComments && settings.profilePublic}
          disabled={!settings.profilePublic}
          onChange={(value) => set('showComments', value)}
        />
        <SettingRow
          icon="person-add-outline"
          title="Cho phép người khác theo dõi"
          detail="Nếu tắt, toàn bộ người đang theo dõi bạn sẽ được gỡ và không thể theo dõi lại cho đến khi bật."
          value={settings.allowFollows && settings.profilePublic}
          disabled={!settings.profilePublic}
          onChange={(value) => set('allowFollows', value)}
          last
        />
      </View>

      {!settings.profilePublic ? <View style={styles.notice}>
        <Ionicons name="eye-off-outline" size={18} color="#8F1D3F" />
        <Text style={styles.noticeText}>Khi hồ sơ công khai tắt, các mục kệ sách, đánh giá, bình luận và nhận theo dõi cũng không được hiển thị cho người khác.</Text>
      </View> : null}

      <Pressable disabled={saving} style={[styles.save, saving && styles.saveDisabled]} onPress={() => { void save(); }}>
        <Text style={styles.saveText}>{saving ? 'Đang lưu…' : 'Lưu quyền riêng tư'}</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function SettingRow({
  icon,
  title,
  detail,
  value,
  onChange,
  disabled = false,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return <View style={[styles.row, last && styles.rowLast, disabled && styles.rowDisabled]}>
    <View style={styles.rowIcon}><Ionicons name={icon} size={18} color="#8F1D3F" /></View>
    <View style={styles.rowCopy}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowDetail}>{detail}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: '#D9CECA', true: '#C77890' }}
      thumbColor={value ? '#8F1D3F' : '#F7F2EF'}
    />
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { height: 58, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', color: '#251D20', fontSize: 17, fontWeight: '900' },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 48 },
  hero: { backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 18, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' },
  heroIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#2B2226', fontSize: 14, fontWeight: '900' },
  heroBody: { color: '#766A6F', fontSize: 10, lineHeight: 16, marginTop: 5 },
  error: { color: '#A12B48', backgroundColor: '#F7E7EC', borderRadius: 12, padding: 10, fontSize: 10, marginTop: 12 },
  saved: { color: '#376B4C', backgroundColor: '#E8F3EC', borderRadius: 12, padding: 10, fontSize: 10, fontWeight: '800', marginTop: 12 },
  card: { marginTop: 14, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 17, overflow: 'hidden' },
  row: { minHeight: 86, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5D8D1' },
  rowLast: { borderBottomWidth: 0 },
  rowDisabled: { opacity: 0.48 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1 },
  rowTitle: { color: '#2B2226', fontSize: 12, fontWeight: '900' },
  rowDetail: { color: '#82767B', fontSize: 9, lineHeight: 14, marginTop: 4 },
  notice: { marginTop: 12, borderRadius: 14, padding: 13, backgroundColor: '#F0E1E5', flexDirection: 'row', gap: 9 },
  noticeText: { flex: 1, color: '#65575D', fontSize: 9, lineHeight: 15 },
  save: { height: 46, borderRadius: 14, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveDisabled: { opacity: 0.55 },
  saveText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
});
