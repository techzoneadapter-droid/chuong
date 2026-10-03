# CHƯƠNG — Phase 3B Moderation & Admin

## Implemented

- User reporting for books and comments.
- Report reasons:
  - copyright
  - plagiarism
  - spam
  - harassment
  - inappropriate content
  - impersonation
  - other
- Report workflow:
  - open
  - reviewing
  - resolved
  - rejected
- Moderation state on:
  - authors
  - books
  - chapters
  - comments
- Moderation states:
  - approved
  - hidden
  - rejected
- Admin dashboard and report queue.
- Admin report detail screen.
- Admin moderation actions:
  - approve / restore
  - hide
  - reject
  - resolve report
  - reject report
- Immutable moderation audit trail through `moderation_actions`.
- Public content RLS now excludes hidden/rejected content.
- Authors can still see their own moderated content.
- Admins can review all report targets.
- Non-admin clients cannot change moderation fields or call admin moderation actions successfully.

## Security

- RLS remains enabled.
- Admin identity is based on `profiles.role = 'admin'`.
- Client users cannot self-promote to admin.
- Moderation RPCs use SECURITY INVOKER and rely on admin-only RLS policies.
- Anonymous users cannot execute moderation RPCs.
- Supabase Security Advisor currently reports zero security lints.
- Foreign-key indexes were added for moderation metadata.

## Production verification

Live tests on the production Supabase project verified:

- reader can submit a report
- admin can read the report
- admin can hide content
- hidden content disappears for ordinary readers
- admin can resolve the report
- audit log receives moderation entries
- non-admin moderation RPC use is blocked
- temporary test data was deleted afterward

## Admin bootstrap

Admin role must be assigned only through a trusted management path (Supabase management / secure server tooling). Never expose an admin-role promotion function to the mobile client.

Once the owner creates a normal CHƯƠNG account, promote that specific profile to `admin` through trusted management tooling.

## Next

1. Create the owner's real account and promote it to admin.
2. Test Admin Center in Vibaocode/mobile preview.
3. Add copyright evidence upload / claimant contact flow if needed.
4. Continue to Phase 4 monetization:
   - CHƯƠNG Xu
   - Google Play Billing
   - Apple IAP
   - author revenue ledger
5. Add Ads only after billing/content flows are stable.
