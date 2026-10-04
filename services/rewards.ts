import { requireSupabase } from '../lib/supabase';
import { toServiceError } from './errors';

export type DailyQuestKey = 'checkin' | 'read_10m' | 'complete_3' | 'review_1' | 'rewarded_ad';

export type DailyQuest = {
  key: DailyQuestKey;
  title: string;
  description: string;
  progress: number;
  target: number;
  reward: number;
  eligible: boolean;
  claimed: boolean;
};

export type DailyCultivationState = {
  date: string;
  streak: number;
  balance: number;
  earnedToday: number;
  quests: DailyQuest[];
};

function mapState(data: any): DailyCultivationState {
  return {
    date: String(data?.date ?? ''),
    streak: Number(data?.streak ?? 0),
    balance: Number(data?.balance ?? 0),
    earnedToday: Number(data?.earnedToday ?? 0),
    quests: Array.isArray(data?.quests)
      ? data.quests.map((quest: any) => ({
          key: quest.key as DailyQuestKey,
          title: String(quest.title ?? ''),
          description: String(quest.description ?? ''),
          progress: Number(quest.progress ?? 0),
          target: Math.max(1, Number(quest.target ?? 1)),
          reward: Number(quest.reward ?? 0),
          eligible: Boolean(quest.eligible),
          claimed: Boolean(quest.claimed),
        }))
      : [],
  };
}

export async function getDailyCultivation(): Promise<DailyCultivationState> {
  try {
    const { data, error } = await requireSupabase().rpc('get_daily_cultivation');
    if (error) throw error;
    return mapState(data);
  } catch (error) {
    throw toServiceError(error, 'Không thể tải nhiệm vụ tu luyện hôm nay.');
  }
}

export async function claimDailyCultivation(key: DailyQuestKey): Promise<DailyCultivationState> {
  try {
    const { data, error } = await requireSupabase().rpc('claim_daily_cultivation', { p_quest_key: key });
    if (error) throw error;
    return mapState(data);
  } catch (error) {
    throw toServiceError(error, 'Chưa thể nhận phần thưởng nhiệm vụ.');
  }
}

export async function claimRewardedAdBonus(): Promise<DailyCultivationState> {
  try {
    const { data, error } = await requireSupabase().rpc('claim_rewarded_ad_bonus');
    if (error) throw error;
    return mapState(data);
  } catch (error) {
    throw toServiceError(error, 'Chưa thể cộng thưởng quảng cáo.');
  }
}

export function dailyQuestProgressText(quest: DailyQuest) {
  if (quest.key === 'read_10m') {
    const currentMinutes = Math.min(10, Math.floor(quest.progress / 60));
    return currentMinutes + '/10 phút';
  }
  return Math.min(quest.progress, quest.target) + '/' + quest.target;
}
