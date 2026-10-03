# CHƯƠNG — Native IAP setup for Linh Thạch

Phase 4D-B source code is prepared for Google Play Billing and Apple In-App Purchase.

## Product IDs

Create each item as a **consumable / one-time in-app product** in both stores:

| Linh Thạch | Product ID |
| ---: | --- |
| 100 | `chuong.linhthach.100` |
| 550 | `chuong.linhthach.550` |
| 1,200 | `chuong.linhthach.1200` |
| 2,600 | `chuong.linhthach.2600` |

The app does not hard-code the VND/USD price. The store returns the localized display price.

## App identifiers

- Android package: `vn.chuong.app`
- iOS bundle ID: `vn.chuong.app`

Do not change either identifier after store products and purchase history are live without a migration plan.

## Google Play server verification

The Supabase Edge Function `iap-verify` expects these server-side secrets:

- `ANDROID_PACKAGE_NAME=vn.chuong.app`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<service account JSON>`

The service account must be authorized for the CHƯƠNG app in Google Play Console.

The mobile purchase request binds the purchase to the signed-in CHƯƠNG account with the Supabase user UUID as `obfuscatedAccountId`.

The server verifies the purchase with Google Play before calling the service-role-only wallet credit RPC.

## Apple App Store server verification

The Edge Function expects:

- `APPLE_BUNDLE_ID=vn.chuong.app`
- `APPLE_IAP_ISSUER_ID=<issuer id>`
- `APPLE_IAP_KEY_ID=<key id>`
- `APPLE_IAP_PRIVATE_KEY=<contents of the .p8 private key>`

The mobile purchase request binds the purchase to the signed-in CHƯƠNG account with the Supabase user UUID as `appAccountToken`.

The server fetches transaction information from the App Store Server API and validates transaction ID, product ID, bundle ID, account binding, quantity and revocation status before wallet credit.

## Native app flow

1. App fetches active products from Supabase.
2. Native store returns product information and localized price.
3. User starts purchase through `expo-iap`.
4. Purchase callback sends only the provider purchase token / transaction ID to `iap-verify`.
5. Edge Function verifies the transaction with Google or Apple.
6. Only then does the service-role-only RPC credit Linh Thạch.
7. Only after a successful verified wallet credit does the native app finish/consume the transaction.
8. Provider transaction IDs are unique in the database, so retries cannot credit the same purchase twice.

## Refund safety

Store purchase reversal support already exists in the backend.

If a refunded/revoked purchase contains more Linh Thạch than the user still owns:

- available Linh Thạch is removed first;
- the remainder becomes `debt_coins`;
- future verified top-ups repay that debt before becoming spendable.

This avoids a negative wallet while still preventing refunded purchases from creating free spendable currency.

## Web / Vibaocode

The Vibaocode preview is web, so it intentionally shows only the catalog. Native IAP does not run in the web preview.

Use a native Android/iOS build for billing tests.

## Before production money

Do not enable live purchasing until all of these pass:

- Google Play internal/sandbox purchase
- Apple sandbox/TestFlight purchase
- duplicate purchase callback retry
- cancelled purchase
- pending Google purchase
- restored/replayed callback
- store refund/revocation reconciliation
- wallet credit matches catalog
- purchase belongs to the signed-in CHƯƠNG account
- no client path can directly credit wallet balance


## Refund/revocation webhooks — Phase 4D-C

CHƯƠNG now has a second Edge Function:

- `iap-verify`: signed-in client purchase verification
- `iap-events`: Google/Apple server-to-server purchase lifecycle events

Webhook endpoint:

`https://lwchpifeahyuoajeidsa.supabase.co/functions/v1/iap-events`

### Google Play RTDN

Create a Google Cloud Pub/Sub push subscription for the Play Console RTDN topic.

Use an authenticated push subscription with an OIDC service account.

Required Edge Function secrets:

- `GOOGLE_PUBSUB_AUDIENCE=https://lwchpifeahyuoajeidsa.supabase.co/functions/v1/iap-events`
- `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL=<OIDC service account email>`

The webhook validates the Google-signed OIDC token before accepting RTDN.

Supported one-time purchase events:

- purchase completed -> server verifies ProductPurchaseV2 and credits once
- pending/canceled purchase -> revokes a previously credited local purchase when Google reports `CANCELLED`
- voided purchase/full refund -> revokes the corresponding Linh Thạch purchase
- Play Console test notification -> logged and ignored safely

The backend still checks the Google Play Developer API before changing wallet state. Raw purchase tokens are not stored in the database.

### Apple App Store Server Notifications V2

Set the App Store Server Notifications V2 production and sandbox URL to:

`https://lwchpifeahyuoajeidsa.supabase.co/functions/v1/iap-events`

The webhook uses the incoming notification only to identify the transaction, then performs a fresh authenticated App Store Server API transaction lookup before changing wallet state.

Supported events:

- `REFUND` -> revoke the Linh Thạch purchase only when Apple API confirms a revocation date
- `REFUND_REVERSED` -> restore the purchase only when Apple API confirms the transaction is no longer revoked
- `CONSUMPTION_REQUEST` -> recorded for admin review; CHƯƠNG does not auto-influence Apple's refund decision yet
- unrelated events -> recorded and ignored

### Refund reversal behavior

If a refund is later reversed by the store:

- the purchase returns to `credited`
- the original Linh Thạch value is restored exactly once
- any outstanding Linh Thạch debt is repaid first
- only the remaining value becomes spendable balance
- `lifetime_reversed` is reduced accordingly

This path is idempotent, so webhook retries do not duplicate credit.

### Admin monitoring

Admin Center now includes:

`Trung tâm quản trị -> Thanh toán & đối soát`

It shows:

- Google Play verification readiness
- App Store verification readiness
- Google RTDN readiness
- Apple notification readiness
- active Linh Thạch packages and store IDs
- credited/revoked purchase counts
- failed/processed webhook counts
- recent webhook events
- recent store purchases

### Store notification testing before production

Before enabling real money:

1. Google Play Console test RTDN reaches `iap-events`.
2. Google sandbox purchase credits exactly once.
3. Cancel/pending-cancel event does not create free Linh Thạch.
4. Voided/refunded Google order revokes the credited amount.
5. Apple App Store Server Notifications test reaches the endpoint.
6. Apple sandbox purchase credits exactly once.
7. Apple refund revokes the purchase.
8. Apple refund reversal restores the purchase exactly once.
9. Retry the same webhook and confirm no duplicated balance change.
10. Confirm admin dashboard has no unresolved failed webhook events.
