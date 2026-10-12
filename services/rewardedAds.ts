export type RewardedAdResult = 'earned' | 'closed' | 'unavailable';

export function rewardedAdsAvailable() {
  return false;
}

export async function showDailyRewardedAd(_sessionId: string): Promise<RewardedAdResult> {
  return 'unavailable';
}
