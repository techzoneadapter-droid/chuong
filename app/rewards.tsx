import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../components/States';
import { XianxiaBackdrop } from '../components/XianxiaBackdrop';
import { xianxia } from '../constants/xianxia';
import { useAuth } from '../contexts/AuthContext';
import {
  claimDailyCultivation,
  claimRewardedAdBonus,
  DailyCultivationState,
  DailyQuest,
  DailyQuestKey,
  dailyQuestProgressText,
  getDailyCultivation,
} from '../services/rewards';
import { rewardedAdsAvailable, showDailyRewardedAd } from '../services/rewardedAds';

const questIcon: Record<DailyQuestKey, keyof typeof Ionicons.glyphMap> = {
  checkin: 'calendar-outline',
  read_10m: 'book-outline',
  complete_3: 'checkmark-done-outline',
  review_1: 'star-outline',
  rewarded_ad: 'play-circle-outline',
};

export default function RewardsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<DailyCultivationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState<DailyQuestKey | null>(null);
  const [error, setError] = useState('');
  const [adAvailable] = useState(() => rewardedAdsAvailable());

  const load = useCallback(async (refresh = false) => {
    if (!user) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setState(await getDailyCultivation());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải nhiệm vụ.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [authLoading, router, user]);

  useFocusEffect(useCallback(() => {
    if (user) void load();
  }, [load, user]));

  const claim = async (quest: DailyQuest) => {
    if (quest.claimed || claiming) return;
    setClaiming(quest.key);
    setError('');
    try {
      if (quest.key === 'rewarded_ad') {
        if (!adAvailable) {
          setError('Quảng cáo thưởng chỉ khả dụng trong bản Android/iOS native. Bản web preview không phát quảng cáo.');
          return;
        }
        const adResult = await showDailyRewardedAd();
        if (adResult !== 'earned') {
          setError(adResult === 'closed' ? 'Bạn cần xem hết quảng cáo để nhận Hạ Phẩm Linh Thạch.' : 'Chưa tải được quảng cáo. Vui lòng thử lại sau.');
          return;
        }
        setState(await claimRewardedAdBonus());
      } else {
        setState(await claimDailyCultivation(quest.key));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa thể nhận thưởng.');
      await load(true).catch(() => undefined);
    } finally {
      setClaiming(null);
    }
  };

  if (authLoading || (loading && user)) {
    return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang mở Nhật Ký Tu Luyện…" /></SafeAreaView>;
  }
  if (!user) return null;
  if (error && !state) {
    return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;
  }

  const quests = state?.quests ?? [];
  const claimedCount = quests.filter((quest) => quest.claimed).length;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={19} color={xianxia.ink} />
        <Text style={styles.backText}>Quay lại</Text>
      </Pressable>
      <View style={styles.topCopy}>
        <Text style={styles.kicker}>NHẬT KÝ TU LUYỆN</Text>
        <Text style={styles.topTitle}>Nhiệm vụ hằng ngày</Text>
      </View>
      <View style={styles.backSpacer} />
    </View>

    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={xianxia.jadeDeep} />}
      contentContainerStyle={styles.page}
    >
      {error ? <Pressable onPress={() => load(true)}><Text style={styles.error}>{error} · Chạm để cập nhật lại</Text></Pressable> : null}

      <View style={styles.hero}>
        <View style={styles.heroSeal}><Ionicons name="flame-outline" size={26} color={xianxia.goldSoft} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>CHUỖI TU LUYỆN</Text>
          <Text style={styles.heroTitle}>{state?.streak ?? 0} ngày liên tiếp</Text>
          <Text style={styles.heroBody}>Điểm danh mỗi ngày để giữ chuỗi. Nhiệm vụ chỉ tính dữ liệu đọc thật đã được CHƯƠNG ghi nhận.</Text>
        </View>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{claimedCount}/{quests.length}</Text>
          <Text style={styles.summaryLabel}>Đã nhận</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>+{state?.earnedToday ?? 0}</Text>
          <Text style={styles.summaryLabel}>Hạ Phẩm hôm nay</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{state?.balance ?? 0}</Text>
          <Text style={styles.summaryLabel}>Số dư Hạ Phẩm</Text>
        </View>
      </View>

      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionKicker}>HÔM NAY</Text>
          <Text style={styles.sectionTitle}>Hoàn thành và nhận thưởng</Text>
        </View>
        <Text style={styles.resetText}>Làm mới mỗi ngày</Text>
      </View>

      <View style={styles.questList}>
        {quests.map((quest) => {
          const progress = Math.min(1, quest.progress / Math.max(1, quest.target));
          const isRewardedAd = quest.key === 'rewarded_ad';
          const buttonLabel = quest.claimed
            ? 'Đã nhận'
            : isRewardedAd && !adAvailable
              ? 'Android/iOS'
              : isRewardedAd
                ? 'Xem quảng cáo'
                : quest.eligible
                  ? 'Nhận +' + quest.reward
                  : dailyQuestProgressText(quest);
          return <View key={quest.key} style={[styles.quest, quest.claimed && styles.questClaimed]}>
            <View style={[styles.questIcon, quest.claimed && styles.questIconClaimed]}>
              <Ionicons name={quest.claimed ? 'checkmark' : questIcon[quest.key]} size={20} color={quest.claimed ? '#FFF8EA' : xianxia.jadeDeep} />
            </View>
            <View style={styles.questBody}>
              <View style={styles.questTop}>
                <Text style={styles.questTitle}>{quest.title}</Text>
                <View style={styles.rewardPill}><Ionicons name="diamond-outline" size={11} color={xianxia.gold} /><Text style={styles.rewardText}>+{quest.reward}</Text></View>
              </View>
              <Text style={styles.questDescription}>{quest.description}</Text>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: (Math.round(progress * 100) + '%') as any }]} /></View>
              <Text style={styles.progressText}>{dailyQuestProgressText(quest)}</Text>
            </View>
            <Pressable
              disabled={quest.claimed || (!quest.eligible && quest.key !== 'rewarded_ad') || (quest.key === 'rewarded_ad' && !adAvailable) || Boolean(claiming)}
              onPress={() => void claim(quest)}
              style={[
                styles.claimButton,
                (quest.eligible || quest.key === 'rewarded_ad') && !quest.claimed && adAvailable && styles.claimButtonReady,
                (quest.claimed || (!quest.eligible && quest.key !== 'rewarded_ad') || (quest.key === 'rewarded_ad' && !adAvailable)) && styles.claimButtonDisabled,
              ]}
            >
              <Text style={[styles.claimText, (quest.eligible || quest.key === 'rewarded_ad') && !quest.claimed && adAvailable && styles.claimTextReady]}>
                {claiming === quest.key ? 'Đang nhận…' : buttonLabel}
              </Text>
            </Pressable>
          </View>;
        })}
      </View>

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={18} color={xianxia.jadeDeep} />
        <View style={{ flex: 1 }}>
          <Text style={styles.noteTitle}>Phần thưởng dựa trên hoạt động thật</Text>
          <Text style={styles.noteBody}>Thời gian đọc và số chương hoàn thành lấy từ phiên đọc đã xác thực. Một nhiệm vụ chỉ nhận được một lần mỗi ngày.</Text>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 68, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(255,248,234,.96)' },
  back: { minWidth: 88, minHeight: 40, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFDF7', borderWidth: 1, borderColor: xianxia.line },
  backText: { color: xianxia.ink, fontSize: 9, fontWeight: '900' },
  backSpacer: { width: 88 },
  topCopy: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  kicker: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1 },
  topTitle: { color: xianxia.ink, fontSize: 15, fontWeight: '900', marginTop: 2 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 44 },
  error: { color: xianxia.cinnabar, fontSize: 9, lineHeight: 14, backgroundColor: '#F8E7E4', borderWidth: 1, borderColor: '#E8C6BE', borderRadius: 11, padding: 10, marginBottom: 10 },
  hero: { minHeight: 126, borderRadius: 20, padding: 16, backgroundColor: '#27423B', borderWidth: 1, borderColor: '#4A685F', flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroSeal: { width: 54, height: 54, borderRadius: 17, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: xianxia.goldSoft, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: '#FFFDF8', fontSize: 22, fontWeight: '900', marginTop: 4 },
  heroBody: { color: 'rgba(255,253,248,.88)', fontSize: 9, lineHeight: 14, marginTop: 5 },
  summary: { flexDirection: 'row', gap: 8, marginTop: 12 },
  summaryItem: { flex: 1, minHeight: 74, borderRadius: 15, padding: 11, backgroundColor: 'rgba(255,253,247,.97)', borderWidth: 1, borderColor: xianxia.line, justifyContent: 'center' },
  summaryValue: { color: xianxia.jadeDeep, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  summaryLabel: { color: xianxia.muted, fontSize: 7.8, lineHeight: 11, textAlign: 'center', marginTop: 3, fontWeight: '700' },
  sectionHead: { marginTop: 22, marginBottom: 9, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionKicker: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: xianxia.ink, fontSize: 17, fontWeight: '900', marginTop: 2 },
  resetText: { color: xianxia.muted, fontSize: 8 },
  questList: { gap: 9 },
  quest: { borderRadius: 17, padding: 11, backgroundColor: 'rgba(255,253,247,.97)', borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  questClaimed: { backgroundColor: '#EEF4EF', borderColor: '#BDD0C3' },
  questIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#BDD0C3' },
  questIconClaimed: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.jadeDeep },
  questBody: { flex: 1, minWidth: 0 },
  questTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  questTitle: { flex: 1, color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  rewardPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 99, backgroundColor: '#F8F0DB', borderWidth: 1, borderColor: '#DEC99F' },
  rewardText: { color: '#76551D', fontSize: 7.5, fontWeight: '900' },
  questDescription: { color: xianxia.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  progressTrack: { height: 4, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E5DDD1', marginTop: 7 },
  progressFill: { height: 4, backgroundColor: xianxia.jade },
  progressText: { color: xianxia.jadeDeep, fontSize: 7.5, fontWeight: '800', marginTop: 4 },
  claimButton: { minWidth: 76, minHeight: 38, borderRadius: 11, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  claimButtonReady: { backgroundColor: xianxia.cinnabar, borderColor: '#A25C66' },
  claimButtonDisabled: { backgroundColor: '#F0EBE3', borderColor: '#DDD3C6' },
  claimText: { color: xianxia.muted, fontSize: 8, fontWeight: '900', textAlign: 'center' },
  claimTextReady: { color: '#FFFDF8' },
  note: { marginTop: 14, borderRadius: 15, padding: 12, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C7D7CC', flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noteTitle: { color: xianxia.jadeDeep, fontSize: 10, fontWeight: '900' },
  noteBody: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, marginTop: 3 },
});
