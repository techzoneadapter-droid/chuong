# CHƯƠNG — Phase 4F notifications

## In-app notification inbox

Implemented routes:

- `/notifications` — inbox
- `/notifications/settings` — notification preferences

Entry points:

- Home bell icon opens the inbox and shows an unread badge.
- Profile -> Thông báo opens the inbox and shows an unread badge.

## Notification categories

- `purchase` — Linh Thạch purchase / refund / restore
- `author_earnings` — author sale earnings and refund adjustments
- `payout` — author withdrawal status
- `comment` — replies and new comments on an author's book
- `moderation` — moderation decisions and report lifecycle
- `system` — reserved for important CHƯƠNG system notices

## Automatic database events

Notifications are created by database triggers, not by trusting client-side UI state.

Current automatic events:

- new author revenue ledger sale
- author revenue refund adjustment
- author payout approved
- author payout paid
- author payout cancelled
- Linh Thạch store purchase credited
- Linh Thạch purchase revoked/refunded
- Linh Thạch refund reversal restored
- reply to a user's comment
- top-level comment on an author's book
- book moderation state changed
- chapter moderation state changed
- comment moderation state changed
- new report -> all admins
- report resolved/rejected -> reporter

Notification creation is non-critical: a notification failure must not roll back purchase, revenue, comment, moderation or payout operations.

## Idempotency

Every automatic event uses a deterministic dedupe key.

The database has a unique index on:

`(user_id, dedupe_key)`

This prevents retrying the same business event from creating duplicate inbox notifications.

## Read state

Authenticated RPCs:

- `get_unread_notification_count()`
- `mark_notification_read(notification_id)`
- `mark_all_notifications_read()`

Clients cannot directly insert/update/delete notification rows.

## Preferences

The user can enable/disable:

- all in-app notifications
- purchases / Linh Thạch
- author earnings
- author payouts
- comments
- moderation
- system notifications

If no preference row exists, all in-app categories default to enabled.

Turning off a category prevents future notification rows for that category. Existing inbox history is preserved.

## Push notification status

The preferences schema already reserves `push_enabled`, but native push is intentionally disabled in the UI in Phase 4F-A.

The next native step should add:

1. device token registration per signed-in user
2. Android FCM / iOS APNs through Expo Notifications or a direct provider
3. server-side push outbox/delivery attempts
4. token invalidation and device logout cleanup
5. deep links using the notification `action_route`
6. rate limiting / batching
7. sandbox device testing before enabling push in production

Do not enable the push toggle until delivery is actually configured.
