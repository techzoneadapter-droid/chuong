import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import {
  CommunityActivity,
  PublicReaderProfile,
  PublicShelfItem,
  getPublicReaderProfile,
  getPublicReaderShelf,
  getReaderPublicActivity,
  setReaderBlock,
  setReaderFollow,
  setReaderMute,
} from '../../services/community';

export default function ReaderProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { user } = useAuth();
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [profile, setProfile] = useState<PublicReaderProfile | null>(null);
  const [shelf, setShelf] = useState<PublicShelfItem[]>([]);
  const [activity, setActivity] = useState<CommunityActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const isSelf = Boolean(userId && user?.id === userId);

  const load = useCallback(async (refresh = false) => {
    if (!userId) {
      setError('Hồ sơ không hợp lệ.');
      setLoading(false);
      return;
    }
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const nextProfile = await getPublicReaderProfile(userId);
      setProfile(nextProfile);
      if (!nextProfile) {
        setShelf([]);
        setActivity([]);
        return;
      }
      const [nextShelf, nextActivity] = await Promise.all([
        getPublicReaderShelf(userId, 50),
        getReaderPublicActivity(userId, 30),
      ]);
      setShelf(nextShelf);
      setActivity(nextActivity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải hồ sơ độc giả.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const displayName = profile?.displayName || profile?.username || 'Độc giả CHƯƠNG';
  const favoriteCount = useMemo(() => shelf.filter((item) => item.shelfStatus === 'favorite').length, [shelf]);
  const completedCount = useMemo(() => shelf.filter((item) => item.shelfStatus === 'completed').length, [shelf]);

  const ensureLogin = () => {
    if (user) return true;
    router.push('/auth/login');
    return false;
  };

  const toggleFollow = async () => {
    if (!profile || !ensureLogin() || working) return;
    const previous = profile;
    const nextFollowing = !profile.viewerFollows;
    setProfile({
      ...profile,
      viewerFollows: nextFollowing,
      followerCount: Math.max(0, profile.followerCount + (nextFollowing ? 1 : -1)),
    });
    setWorking(true);
    try {
      await setReaderFollow(profile.id, nextFollowing);
    } catch (cause) {
      setProfile(previous);
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật theo dõi.');
    } finally {
      setWorking(false);
    }
  };

  const toggleMute = async () => {
    if (!profile || !ensureLogin() || working) return;
    const previous = profile;
    const next = !profile.viewerMuted;
    setProfile({ ...profile, viewerMuted: next });
    setWorking(true);
    try {
      await setReaderMute(profile.id, next);
    } catch (cause) {
      setProfile(previous);
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật ẩn hoạt động.');
    } finally {
      setWorking(false);
    }
  };

  const applyBlock = async (blocked: boolean) => {
    if (!profile || !ensureLogin() || working) return;
    setWorking(true);
    try {
      await setReaderBlock(profile.id, blocked);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật chặn.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải hồ sơ độc giả…" /></SafeAreaView>;
  if (error && !profile) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => { void load(); }} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <Text style={styles.topTitle}>Hồ sơ độc giả</Text>
      <Pressable style={styles.iconButton} onPress={() => { void load(true); }}><Ionicons name="refresh" size={20} color="#8F1D3F" /></Pressable>
    </View>

    {!profile ? <View style={styles.unavailable}>
      <View style={styles.unavailableIcon}><Ionicons name="lock-closed-outline" size={26} color="#8F1D3F" /></View>
      <Text style={styles.unavailableTitle}>Hồ sơ này không công khai</Text>
      <Text style={styles.unavailableBody}>Chủ hồ sơ có thể đã tắt hồ sơ công khai hoặc không cho phép tài khoản của bạn xem nội dung này.</Text>
      <Pressable style={styles.outlineButton} onPress={() => router.back()}><Text style={styles.outlineText}>Quay lại</Text></Pressable>
    </View> : <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.hero}>
        {profile.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{displayName[0]?.toUpperCase() || 'C'}</Text></View>}
        <View style={styles.heroCopy}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.handle}>{profile.username ? '@' + profile.username : profile.role === 'author' ? 'Tác giả' : 'Độc giả CHƯƠNG'}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statValue}>{profile.followerCount.toLocaleString('vi-VN')}</Text><Text style={styles.statLabel}>Người theo dõi</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{profile.followingCount.toLocaleString('vi-VN')}</Text><Text style={styles.statLabel}>Đang theo dõi</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{favoriteCount + completedCount}</Text><Text style={styles.statLabel}>Truyện công khai</Text></View>
      </View>

      {isSelf ? <View style={styles.selfActions}>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/profile/edit')}><Ionicons name="create-outline" size={16} color="#FFF" /><Text style={styles.primaryText}>Chỉnh sửa hồ sơ</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push('/profile/privacy')}><Ionicons name="shield-checkmark-outline" size={16} color="#8F1D3F" /><Text style={styles.secondaryText}>Quyền riêng tư</Text></Pressable>
      </View> : <>
        <View style={styles.actions}>
          <Pressable
            disabled={working || profile.viewerBlocked || !profile.allowFollows}
            style={[styles.primaryButton, (profile.viewerFollows || profile.viewerBlocked || !profile.allowFollows) && styles.primaryMuted]}
            onPress={() => { void toggleFollow(); }}
          >
            <Ionicons name={profile.viewerFollows ? 'checkmark' : 'person-add-outline'} size={16} color={profile.viewerFollows || profile.viewerBlocked || !profile.allowFollows ? '#8F1D3F' : '#FFF'} />
            <Text style={[styles.primaryText, (profile.viewerFollows || profile.viewerBlocked || !profile.allowFollows) && styles.primaryMutedText]}>
              {profile.viewerBlocked ? 'Đã chặn' : !profile.allowFollows ? 'Không nhận theo dõi' : profile.viewerFollows ? 'Đang theo dõi' : 'Theo dõi'}
            </Text>
          </Pressable>
          <Pressable disabled={working || profile.viewerBlocked} style={styles.secondaryButton} onPress={() => { void toggleMute(); }}>
            <Ionicons name={profile.viewerMuted ? 'volume-mute' : 'volume-mute-outline'} size={16} color="#8F1D3F" />
            <Text style={styles.secondaryText}>{profile.viewerMuted ? 'Đã ẩn' : 'Ẩn hoạt động'}</Text>
          </Pressable>
        </View>
        <Pressable
          disabled={working}
          style={styles.blockButton}
          onPress={() => {
            if (profile.viewerBlocked) return void applyBlock(false);
            Alert.alert('Chặn độc giả?', 'Hai bên sẽ bỏ theo dõi nhau và hoạt động của người này sẽ không còn xuất hiện với bạn.', [
              { text: 'Hủy', style: 'cancel' },
              { text: 'Chặn', style: 'destructive', onPress: () => { void applyBlock(true); } },
            ]);
          }}
        >
          <Ionicons name={profile.viewerBlocked ? 'lock-open-outline' : 'ban-outline'} size={15} color="#9B334D" />
          <Text style={styles.blockText}>{profile.viewerBlocked ? 'Bỏ chặn độc giả' : 'Chặn độc giả'}</Text>
        </Pressable>
      </>}

      <SectionTitle title="Kệ sách công khai" meta={profile.showShelves || isSelf ? favoriteCount + completedCount + ' truyện' : 'Đã ẩn'} />
      {profile.viewerBlocked ? <PrivacyNotice text="Bạn đã chặn hồ sơ này. Kệ sách và hoạt động được ẩn." /> : (!profile.showShelves && !isSelf) ? <PrivacyNotice text="Độc giả này đang ẩn kệ sách công khai." /> : shelf.length === 0 ? <PrivacyNotice text="Chưa có truyện Yêu thích hoặc Đã hoàn thành được chia sẻ." /> : <View style={styles.shelfGrid}>
        {shelf.map((item) => <Pressable key={item.bookId} style={styles.bookCard} onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.bookId } })}>
          {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.cover} /> : <View style={styles.coverFallback}><Text style={styles.coverText}>{item.title[0]?.toUpperCase() || 'C'}</Text></View>}
          <View style={styles.bookCopy}>
            <Text numberOfLines={2} style={styles.bookTitle}>{item.title}</Text>
            <Text numberOfLines={1} style={styles.bookAuthor}>{item.authorName}</Text>
            <Text style={styles.shelfBadge}>{item.shelfStatus === 'favorite' ? 'Yêu thích' : 'Đã hoàn thành'}</Text>
          </View>
        </Pressable>)}
      </View>}

      <SectionTitle title="Hoạt động công khai" meta={activity.length ? activity.length + ' gần đây' : ''} />
      {profile.viewerBlocked ? <PrivacyNotice text="Hoạt động bị ẩn vì bạn đã chặn hồ sơ này." /> : ((!profile.showReviews && !profile.showComments) && !isSelf) ? <PrivacyNotice text="Độc giả này đang ẩn hoạt động đánh giá và bình luận trên hồ sơ." /> : activity.length === 0 ? <PrivacyNotice text="Chưa có hoạt động công khai gần đây." /> : activity.map((item) => <Pressable key={item.activityType + ':' + item.activityId} style={styles.activityCard} onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.bookId } })}>
        <View style={styles.activityHead}>
          <View style={styles.activityIcon}><Ionicons name={item.activityType === 'review' ? 'star-outline' : 'chatbubble-outline'} size={15} color="#8F1D3F" /></View>
          <View style={{ flex: 1 }}><Text style={styles.activityType}>{item.activityType === 'review' ? 'Đánh giá' : 'Bình luận'}</Text><Text style={styles.activityDate}>{new Date(item.createdAt).toLocaleString('vi-VN')}</Text></View>
          {item.rating ? <Text style={styles.rating}>{item.rating} ★</Text> : null}
        </View>
        <Text style={styles.activityBook}>{item.bookTitle}</Text>
        {item.body ? <Text numberOfLines={4} style={styles.activityBody}>{item.body}</Text> : null}
      </Pressable>)}

      <View style={styles.privacyNote}>
        <Ionicons name="eye-off-outline" size={18} color="#8F1D3F" />
        <Text style={styles.privacyNoteText}>CHƯƠNG không hiển thị tiến độ đọc, lịch sử đọc riêng tư hoặc truyện đang đọc trong hồ sơ công khai.</Text>
      </View>
    </ScrollView>}
  </SafeAreaView>;
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}</View>;
}

function PrivacyNotice({ text }: { text: string }) {
  return <View style={styles.notice}><Ionicons name="lock-closed-outline" size={17} color="#8F1D3F" /><Text style={styles.noticeText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { height: 58, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', color: '#251D20', fontSize: 17, fontWeight: '900' },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 52 },
  error: { color: '#A12B48', backgroundColor: '#F7E7EC', borderRadius: 12, padding: 10, fontSize: 10, marginBottom: 10 },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  unavailableIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  unavailableTitle: { color: '#2B2226', fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  unavailableBody: { color: '#796D72', fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 420, marginTop: 7 },
  outlineButton: { marginTop: 15, height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#8F1D3F', paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: '#8F1D3F', fontSize: 10, fontWeight: '900' },
  hero: { flexDirection: 'row', gap: 15, alignItems: 'center' },
  avatar: { width: 82, height: 82, borderRadius: 41 },
  avatarFallback: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 30, fontWeight: '900' },
  heroCopy: { flex: 1 },
  name: { color: '#241C20', fontSize: 23, fontWeight: '900' },
  handle: { color: '#8F1D3F', fontSize: 10, marginTop: 4, fontWeight: '800' },
  bio: { color: '#62565B', fontSize: 11, lineHeight: 17, marginTop: 8 },
  stats: { marginTop: 17, padding: 14, borderRadius: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: '#2B2226', fontSize: 17, fontWeight: '900' },
  statLabel: { color: '#81757A', fontSize: 9, marginTop: 3, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 13 },
  selfActions: { flexDirection: 'row', gap: 8, marginTop: 13 },
  primaryButton: { flex: 1, minHeight: 42, borderRadius: 13, backgroundColor: '#8F1D3F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  primaryMuted: { backgroundColor: '#F0E1E5', borderWidth: 1, borderColor: '#D8BAC3' },
  primaryText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  primaryMutedText: { color: '#8F1D3F' },
  secondaryButton: { flex: 1, minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#8F1D3F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  secondaryText: { color: '#8F1D3F', fontSize: 10, fontWeight: '900' },
  blockButton: { alignSelf: 'center', marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  blockText: { color: '#9B334D', fontSize: 9, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 26, marginBottom: 10 },
  sectionTitle: { color: '#241C20', fontSize: 18, fontWeight: '900' },
  sectionMeta: { color: '#8F1D3F', fontSize: 9, fontWeight: '800' },
  shelfGrid: { gap: 8 },
  bookCard: { minHeight: 92, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 15, padding: 10, flexDirection: 'row', gap: 11 },
  cover: { width: 54, height: 72, borderRadius: 9 },
  coverFallback: { width: 54, height: 72, borderRadius: 9, backgroundColor: '#6D2E46', alignItems: 'center', justifyContent: 'center' },
  coverText: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  bookCopy: { flex: 1, justifyContent: 'center' },
  bookTitle: { color: '#2B2226', fontSize: 12, fontWeight: '900' },
  bookAuthor: { color: '#81757A', fontSize: 9, marginTop: 4 },
  shelfBadge: { color: '#8F1D3F', fontSize: 8, fontWeight: '900', marginTop: 7 },
  activityCard: { backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 15, padding: 13, marginBottom: 8 },
  activityHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  activityIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  activityType: { color: '#4B4045', fontSize: 10, fontWeight: '900' },
  activityDate: { color: '#94888D', fontSize: 8, marginTop: 2 },
  rating: { color: '#B9842E', fontSize: 10, fontWeight: '900' },
  activityBook: { color: '#8F1D3F', fontSize: 11, fontWeight: '900', marginTop: 9 },
  activityBody: { color: '#51464A', fontSize: 10, lineHeight: 16, marginTop: 5 },
  notice: { minHeight: 76, borderRadius: 14, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  noticeText: { flex: 1, color: '#776A70', fontSize: 10, lineHeight: 15 },
  privacyNote: { marginTop: 20, borderRadius: 14, backgroundColor: '#F0E1E5', padding: 13, flexDirection: 'row', gap: 9 },
  privacyNoteText: { flex: 1, color: '#65575D', fontSize: 9, lineHeight: 15 },
});
