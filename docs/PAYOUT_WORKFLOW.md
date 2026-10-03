# CHƯƠNG — Phase 4E author payout workflow

## Scope

This phase adds a controlled payout-request workflow for authors without pretending that CHƯƠNG already has a licensed payout provider.

The workflow is:

1. Author earns Linh Thạch revenue.
2. Pending/approved requests reserve the requested amount so it cannot be requested twice.
3. Author stores a non-sensitive payout destination label (for example `MB Bank •••• 1234`).
4. Author submits a withdrawal request.
5. Admin reviews KYC/tax status and the payout destination.
6. Admin approves or cancels the request.
7. Only after money is transferred outside CHƯƠNG does admin record the external transaction/reference.
8. The request becomes `paid` and `paid_out_coins` increases exactly once.

## Safety rules

- Request creation is server-side and locks the author revenue account.
- Requestable amount =
  `author earnings - refunded earnings - paid payouts - pending/approved requests`.
- Idempotency keys prevent duplicate requests on retry.
- Authors can cancel only `pending` requests.
- Admin can approve only `pending` requests.
- Approval requires:
  - KYC = `verified`
  - tax = `verified` or `not_required`
  - payout destination label configured
- Admin can mark paid only after approval.
- Mark-paid requires an external settlement/reference code.
- Retrying mark-paid does not increment `paid_out_coins` twice.
- A late refund that reduces available author earnings can block settlement until the discrepancy is resolved.

## KYC/tax placeholders

Phase 4E intentionally does not upload or store identity-document images.

The database stores only workflow status:

- KYC: `not_submitted | pending | verified | rejected`
- Tax: `not_submitted | pending | verified | rejected | not_required`

The current payout destination field is a display label only. Do not put full bank account numbers, CCCD/passport numbers, passwords, OTPs, or private keys in it.

A later payout-provider integration should replace the display-only destination with a provider token/reference.

## User screens

Author:

`Doanh thu tác giả -> Yêu cầu rút doanh thu`

Admin:

`Trung tâm quản trị -> Thanh toán tác giả`

## Production state

This feature records payout requests and external settlement references. It does not itself send money to a bank.

Real automated payout should be enabled only after choosing a payout provider and completing legal, KYC, tax, accounting and reconciliation requirements for the markets served.
