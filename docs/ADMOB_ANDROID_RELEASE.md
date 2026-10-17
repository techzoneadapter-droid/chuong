# CHƯƠNG Android – NVB AdMob go-live checklist

This rollout is intentionally OFF by default in release builds until user consent, signed rewarded verification, native device testing, store association and AdMob review have passed.

## AdMob identifiers (public; owned by NVB)

- Publisher: `pub-2610920886028786`
- Android App ID: `ca-app-pub-2610920886028786~8409797383`
- Banner: `ca-app-pub-2610920886028786/7045578976`
- Chapter Interstitial: `ca-app-pub-2610920886028786/9557201408`
- Rewarded: `ca-app-pub-2610920886028786/2277387891`, 5 Hạ Phẩm.
- Android package: `vn.chuong.app`.

In EAS `production`, `app.config.js` uses the real Android App ID only when `EXPO_PUBLIC_ADMOB_LIVE=true`. Preview builds use Google's official test app ID. Banner/interstitial/rewarded display in development with official test IDs. In a released build **nothing monetizes by default** until `EXPO_PUBLIC_ADMOB_LIVE=true` is set in the EAS build environment and a new release is built. Public ID override environment variables are supported as before.

## Placements and constraints

- Banner only renders after SDK readiness; suppressed for VIP. Live builds require UMP consent. Development builds use only official sample units and do not depend on a publisher UMP message configured for the sample App ID.
- Interstitial only considers forward navigation when the previous chapter is >=90% read, online and unlocked. It is preloaded without blocking reading; at most 1 per 4 eligible advances and not more frequently than once per 10 minutes. No ad on failed loading.
- Rewarded requires explicit interaction, UMP consent for live builds, authenticated user, short-lived server ticket, and **Google's signed SSV callback**. The client never credits a wallet, including when the SDK raises `EARNED_REWARD`. VIP has no ads.

## Important production rollout (do not skip)

1. Merge source only once CI/native QA passes. The original backend still contains an insecure direct grant RPC until migration is deployed.
2. Apply migration `supabase/migrations/202610160002_admob_verified_rewards.sql` after preceding migrations. This prevents unverified client grants, updates the public reward to 5 Hạ Phẩm, and adds one-use signed reward tickets. Preserve financial ledger backup and confirm database migrations.
3. Deploy `supabase/functions/admob-ssv/index.ts` with JWT verification disabled ONLY for this handler (signed by Google), e.g. `supabase functions deploy admob-ssv --no-verify-jwt`. The handler verifies Google ECDSA keys/signature BEFORE using Supabase service credentials; keep those credentials inside Supabase only.
4. AdMob > Chương > Đơn vị quảng cáo > `CHUONG_Android_Daily_Reward` > Cài đặt nâng cao > Xác minh phía máy chủ (SSV). Set callback URL to:
   `https://lwchpifeahyuoajeidsa.supabase.co/functions/v1/admob-ssv`
   Verify URL and save. Keep the AdMob reward amount at **5**. Google's dashboard test may use dummy `user_id` and `custom_data`; a verified signature on such a test must NOT mint any wallet stones.
5. Build an Android **internal test** using Google's official test ads, check UMP, VIP suppression, reader transitions, failed network scenarios, and the reward UI's pending confirmation. Test 5-stone credit separately on a controlled real SSV invocation with valid test user, only after Google/AdMob approves live testing; never self-click production ads.
6. Add `https://nvbtech.com.vn/` as the developer website in the public Google Play listing. Publish and verify `https://nvbtech.com.vn/app-ads.txt` (NVB website repository now includes this file). Link public CHƯƠNG store listing to AdMob for review. Do not assume internal/closed testing listing is sufficient.
7. Only when app readiness is approved, privacy/Data Safety declarations match the implementation, native QA passes and SSV is validated, set `EXPO_PUBLIC_ADMOB_LIVE=true` for EAS production and create a fresh AAB. Ensure real ad unit IDs in the final build.

## Money/accounting

- One verified Rewarded video gives **5 Hạ Phẩm**, once per UTC day.
- Other free daily quest stones continue to be available. Hạ Phẩm can be spent on VIP chapters, but **one Hạ Phẩm is not a fixed number of VND**.
- Author ad-pool revenue is reconciled from actual AdMob revenue per accounting period, then allocated based on eligible spent Hạ Phẩm (see `docs/author-vnd-settlement.md`). It is **not** earned immediately per view or per stone.
- Never disclose Supabase service-role keys in Github or mobile builds.

## Known external blockers

- Link real EAS project ID and supply credentials, complete physical Android QA, AdMob app review and public Google Play listing.
- Deploy the new SQL migration and Edge Function to the real Supabase environment. Github source changes alone do not do this.
- Google Ads SSV callbacks may be delayed. Users should see pending verification; do not mint coins from the SDK callback.
