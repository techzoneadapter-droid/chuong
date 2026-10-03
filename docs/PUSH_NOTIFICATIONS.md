# CHƯƠNG — Phase 4F-B native push notifications

## Architecture

CHƯƠNG uses:

- `expo-notifications` on Android/iOS
- Expo Push Tokens on the client
- Supabase `push_devices` as the device registry
- Supabase `push_deliveries` as a durable delivery/retry ledger
- `push-dispatch` Edge Function as the worker
- Supabase Cron + `pg_net` to invoke the worker every minute
- Expo Push Service to fan out to FCM/APNs
- Expo push receipts to detect invalid devices and provider errors

The worker is protected by a random secret generated inside Postgres and stored in Supabase Vault. The secret is never committed to git.

## Native dependencies

SDK 54 compatible dependencies are installed:

- `expo-notifications ~0.32.17`
- `expo-device ~8.0.10`
- `expo-constants ~18.0.14`

The `expo-notifications` config plugin is enabled in `app.json`.

## Client behavior

When the user enables Push notification:

1. Android creates the `chuong-default` notification channel.
2. CHƯƠNG requests OS notification permission.
3. The app resolves the EAS project ID.
4. The app requests an Expo Push Token.
5. The device is registered through the authenticated `register_push_device` RPC.
6. Notification preferences are updated with `push_enabled=true`.

When the user signs out:

- the current device is disabled before the Supabase session is closed.

When the app returns to foreground:

- an enabled device registration is refreshed best-effort.

When a push token rotates:

- the app re-registers the device.

When the user taps a push:

- `actionRoute` is routed through Expo Router.

## Database safety

`push_devices`:

- belongs to one signed-in user
- clients can only read their own active-device rows
- clients cannot directly insert/update/delete device registrations
- writes go through owner-checked RPCs
- re-registering a device moves the installation to the current signed-in account
- invalid Expo tokens are automatically disabled

`push_deliveries`:

- one row per notification/device
- unique `(notification_id, device_id)`
- retry count and next-attempt timestamp
- Expo ticket ID
- push receipt status
- delivery timestamp
- ticket/receipt error details

The client cannot read or mutate delivery jobs.

## Delivery worker

`push-dispatch`:

- claims up to 100 pending deliveries at a time
- uses `FOR UPDATE SKIP LOCKED`
- releases stale processing locks after five minutes
- sends batches to Expo Push Service
- retries transient ticket failures with backoff
- checks Expo push receipts
- disables `DeviceNotRegistered` tokens
- retries `MessageRateExceeded`
- stops retrying after six attempts

The scheduler invokes the worker every minute.

## Current limitation before real-device verification

A real Expo push token requires an EAS-linked native build.

Before production push can be verified:

1. Link the repository to an Expo/EAS project:
   `npx eas-cli@latest init`
2. Confirm the generated EAS `projectId`.
3. Configure Android FCM v1 credentials in EAS.
4. Configure Apple APNs credentials in EAS.
5. Create/install an Android or iOS preview build.
6. Sign in to CHƯƠNG.
7. Open:
   `Thông báo -> Cài đặt thông báo -> Push notification`
8. Grant OS permission.
9. Trigger a real CHƯƠNG event and verify both:
   - system push
   - in-app Inbox/deep link

Remote push on Android should be tested in a native development/preview/release build rather than Expo Go.

## EAS build profiles

`eas.json` includes:

- `preview`: internal distribution
- `production`: production build with auto-incremented build number/version code

No Expo account credential or store signing key is committed to the repository.
