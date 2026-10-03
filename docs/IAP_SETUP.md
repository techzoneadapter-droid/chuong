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
