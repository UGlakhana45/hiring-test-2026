# DECISIONS

## Why Custom Claims over Firestore reads for permissions

We store `planId`, `claimRole`, `seatLimit`, and `activeAddons` directly in the Firebase Auth ID token as Custom Claims. The client decodes them locally via `usePermissions()` and `<RequireFeature>` — no Firestore round-trip needed.

The alternative was reading `subscriptions/{clinicId}` in every component that gates on plan tier. In practice that meant N reads per screen mount across analytics, storage, seat-invite, and billing views. Claims collapse all of that into a single decoded JWT that's already present.

Worth noting the trade-offs:

- **1 000-byte cap on claims.** Our payload (`clinicId`, `planId`, `claimRole`, `seatLimit`, `activeAddons[]`) comes in well under 200 bytes. We'd hit the cap only if we stuffed per-feature flags in there, which we deliberately avoided.
- **~60 min staleness window.** Firebase auto-refreshes tokens hourly. Between refreshes, claims on the client can be stale. We force-refresh after checkout (see below) and accept the window for everything else — the server never trusts client claims for mutations anyway.
- **Claims are for UI gating, not security.** Every write-path enforcement (seat invites, billing changes) re-derives limits from Firestore inside the Cloud Function. The client token is a fast hint, not a trusted source.

Claim shape:

```
{
  clinicId:     string | null,
  planId:       "free" | "pro" | "premium" | "vip",
  claimRole:    "admin" | "member" | "patient",
  seatLimit:    number,         // VIP uses 999999 sentinel, see below
  activeAddons: string[]        // e.g. ["extra_storage", "advanced_analytics"]
}
```

## Role mapping

| Claim (`claimRole`) | Firestore (`users.role`) | Who |
|---|---|---|
| `admin` | `owner` | Clinic owner — billing, staff mgmt |
| `member` | `staff` | Clinic staff — appointments |
| `patient` | `patient` | End-user, no clinic |

We used generic RBAC terms in claims so they don't couple to the "clinic" domain if we ever add other entity types.

## Force-refreshing after Stripe checkout

When a Stripe checkout webhook fires, the Cloud Function sets new claims on every clinic member via `admin.auth().setCustomUserClaims()`. But the client still holds a cached token with the old claims and won't naturally refresh for up to an hour.

So when the billing screen receives the `?success=true` deep-link back from Stripe, it calls `refreshIdToken()` on the auth store, which does:

```typescript
await user.getIdToken(true);           // forces a server round-trip
const result = await user.getIdTokenResult(); // re-reads claims
```

We also swapped the auth listener from `onAuthStateChanged` to `onIdTokenChanged`. The difference: `onIdTokenChanged` fires on token refreshes (not just sign-in/sign-out), so the forced refresh above flows into the Zustand store automatically.

## VIP seat limit: Infinity → sentinel

JSON can't represent `Infinity`. Claims use `999999` as the VIP sentinel (`CLAIM_SEAT_LIMIT_SENTINEL`). The client-side `PLAN_CONFIG` still uses JS `Infinity` for display (the `SeatUsageBar` shows "∞"), and `clinic.seats.max` in Firestore also stores the native `Infinity`. The sentinel only lives in JWT payloads and server-side seat arithmetic.

## Mid-cycle downgrade handling

The core problem: a Premium clinic (15 seats, 10 in use) downgrades to Pro (5 seats). Revoking access immediately would break scheduled appointments and waste the time they already paid for.

Our approach is a deferred downgrade:

1. `initiateDowngrade` callable validates active seat count against the target plan's limit.
2. If active seats exceed the limit → **block**. Return a `seat_conflict` with counts so the owner knows exactly how many staff to remove first. We went with blocking rather than auto-deactivating staff because there's no safe default for "which staff to kick" — that's a product decision the owner should make.
3. If seats fit → schedule the change for end-of-billing-period. Stripe gets `proration_behavior: 'none'` (or `cancel_at_period_end` for downgrade-to-free). Firestore gets `downgradeAt` and `scheduledPlan`. Claims, `plan`, and `seats.max` all stay at the current (higher) tier until the period rolls.
4. When Stripe fires `customer.subscription.updated` after the period boundary, the webhook sees `downgradeAt <= now`, applies the lower plan, updates Firestore, and syncs claims.

A `<DowngradePendingBanner>` sits above the tab bar and reads `subscription.downgradeAt` / `subscription.scheduledPlan` from the existing Firestore listener. It shows something like *"Your plan will change to Pro on Jun 15, 2026."*

## Seat validation

`validateSeatInvite` is a Cloud Function callable that recomputes the seat limit from Firestore on every call:

```
basePlanSeats + (extraSeatPackCount × 5)
```

It does not read `seatLimit` from the caller's JWT. Claims can be stale, so for anything involving real enforcement we go back to the source. On the client, `usePermissions().seatLimit` is just a UI hint for showing/hiding the invite button.

## Firestore rules

The existing rules still use `get()` calls to `users/{uid}` for `belongsToClinic()` and `isOwner()`. Migrating those to `request.auth.token.claimRole` / `request.auth.token.clinicId` would eliminate those reads, but it would mean rewriting and re-testing every rule path. We left them as-is because:

- Client RBAC (the read-path optimization we care about) is already claim-first.
- Write-path enforcement runs through Cloud Functions using the Admin SDK, which bypasses rules entirely.

Migrating rules to claims is a clean follow-up once we have integration tests covering every path.

## Grace period on payment failure

When `invoice.payment_failed` fires, we set `subscription.status = 'grace_period'` with a 7-day window. During that window:

- Claims stay unchanged — the clinic keeps feature access.
- The client picks up the status change via its existing `subscribeToSubscription` listener and shows a warning banner.
- `validateSeatInvite` blocks new staff (it requires `status === 'active'`).

When Stripe gives up retrying (~7 days with Smart Retries), it fires `customer.subscription.deleted` and we revert to free, deactivate excess seats, and revoke tokens.

## Cancellation and seat cleanup

On `customer.subscription.deleted`:

- Plan reverts to `free`, status to `canceled`.
- Excess seats beyond the free limit (1) are deactivated. The owner always keeps their seat; staff get removed.
- Removed staff have their claims wiped to `patient` / `free` and their refresh tokens revoked.

Note on revocation: Firebase ID tokens stay valid for up to 1 hour after `revokeRefreshTokens()`. For immediate enforcement, Firestore rules on `seats/{clinicId}/members/{userId}` should check the `active` flag in the document, not just the role claim.
