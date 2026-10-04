export type RewardedAdResult = 'earned' | 'closed' | 'unavailable';

export function rewardedAdsAvailable() {
  return false;
}

export async function showDailyRewardedAd(): Promise<RewardedAdResult> {
  return 'unavailable';
}
