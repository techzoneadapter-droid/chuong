# CHƯƠNG — VIP subscriptions and AdMob

Phase 4P connects the existing Premium entitlement model to native store subscriptions and replaces the mobile ad placeholder with Google Mobile Ads.

## Plans

### Standard

- 100 MB offline quota
- advertising enabled
- no whole-book AI translation

### CHƯƠNG VIP

- 2 GB offline quota
- ad-free experience
- whole-book AI translation for authors

Premium access is always re-checked server-side. Client UI state is not an entitlement boundary.

## Subscription product

The app uses one monthly auto-renewing subscription product.

Default Product ID on both stores:

`chuong.vip.monthly`

It may be overridden at build/server configuration time:

- `EXPO_PUBLIC_PREMIUM_GOOGLE_PRODUCT_ID`
- `EXPO_PUBLIC_PREMIUM_APPLE_PRODUCT_ID`
- `PREMIUM_GOOGLE_PRODUCT_ID` on Supabase Edge Functions
- `PREMIUM_APPLE_PRODUCT_ID` on Supabase Edge Functions

The public/mobile and server values **must match** the product created in Google Play Console / App Store Connect.

## Native purchase flow

The native app uses `expo-iap`.

1. Fetch the store subscription with `type: 'subs'`.
2. On Android, send the available subscription offer token(s).
3. Bind the purchase to the signed-in CHƯƠNG user:
   - Google: `obfuscatedAccountId`
   - Apple: `appAccountToken`
4. Send the purchase token / transaction ID to `subscription-verify`.
5. The server independently calls Google Play Developer API or App Store Server API.
6. The server updates `account_subscriptions`.
7. Only after successful verification does the app finish the transaction and refresh Premium state.

The Premium screen also exposes **Khôi phục giao dịch VIP** on Android/iOS.

## Renewal / cancellation reconciliation

The existing `iap-events` Edge Function now also handles subscription events.

- Google Real-time Developer Notifications: fetches the current SubscriptionPurchaseV2 state and recalculates Premium.
- Apple App Store Server Notifications V2: uses the incoming transaction ID only as a lookup hint, then fetches the transaction again from App Store Server API before changing Premium state.

A cancellation does not remove Premium early when the verified paid period has not expired. Expiry/revocation removes the entitlement when the verified expiry is no longer in the future.

## Required store-server secrets

Google:

- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `ANDROID_PACKAGE_NAME=vn.chuong.app`
- optional `PREMIUM_GOOGLE_PRODUCT_ID`

Apple:

- `APPLE_IAP_ISSUER_ID`
- `APPLE_IAP_KEY_ID`
- `APPLE_IAP_PRIVATE_KEY`
- `APPLE_BUNDLE_ID=vn.chuong.app`
- optional `PREMIUM_APPLE_PRODUCT_ID`

The existing RTDN / App Store notification endpoint must be configured in the store consoles to point at the deployed `iap-events` Edge Function.

## AdMob

Native Android/iOS builds use `react-native-google-mobile-ads 16.5.0`.

Why 16.5.0: CHƯƠNG is currently Expo SDK 54 / React Native 0.81.5. The v17 line requires newer React Native, so this project intentionally stays on the latest v16 line compatible with the current runtime.

Ad consent is gathered with Google UMP before SDK initialization. Premium users do not initialize/load ad placements through CHƯƠNG's ad bridge.

Production environment variables:

- `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`
- `EXPO_PUBLIC_ADMOB_IOS_APP_ID`
- `EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID`
- `EXPO_PUBLIC_ADMOB_IOS_BANNER_ID`

When App IDs are not configured, `app.config.js` uses Google's official sample App IDs so development builds do not crash. Native banners use Google test ad units in development or when a production banner ID is absent.

**Never ship the production release with the sample/test AdMob IDs.**

The module contains native code, so ads are not available inside Expo Go. Build/install an EAS development or production client.

## External console work still required

Source code cannot create these assets on the owner's behalf without store accounts/credentials:

1. Create the `chuong.vip.monthly` subscription in Google Play Console.
2. Create the matching auto-renewable subscription in App Store Connect if iOS is released.
3. Configure Google Play service account access and RTDN.
4. Configure App Store Server API credentials and Server Notifications V2.
5. Create/register both apps in AdMob.
6. Create banner ad units and inject the production IDs through EAS environment variables.
7. In Google Play Console declare that the app contains ads.
8. Configure AdMob Privacy & messaging / UMP consent.
9. Test purchases with Play internal testing / App Store sandbox.
10. Test subscription renewal, cancellation, expiry, refund and restore on physical devices.
