export type RewardedAdResult = 'earned' | 'closed' | 'unavailable';

export function rewardedAdsAvailable() {
  return false;
}

export async function showDailyRewardedAd(_userId: string, _ticket: string): Promise<RewardedAdResult> {
  return 'unavailable';
}
