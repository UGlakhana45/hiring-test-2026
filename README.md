# blackcode SA — Developer Hiring Test 2026

blackcode SA is a Swiss software agency building Metaesthetics — a SaaS platform for aesthetic medicine clinics — and AIOS Companion, an AI agent platform. We're a small, senior team and we're looking for a developer who can own complex systems, not just implement tickets.

---

## What this is

A half-built React Native app. Your job is to finish specific parts of it.

Estimated time: **8 hours**. No tricks. No gotchas. We picked a domain (clinic billing) that's genuinely complex but doesn't require domain expertise — it's logic all the way down.

The code compiles. The emulator runs. The seed populates realistic data. You're not starting from scratch, and you're not fixing someone else's mess — the scaffold is intentionally clean. Your job is to implement the hard parts we left open.

---

## The domain

A clinic management app. Three user types:

- **Owner** — runs the clinic, manages staff, controls billing
- **Staff** — works at the clinic, manages appointments
- **Patient** — books and views their own appointments

The billing system is the interesting part. Clinics subscribe to a base plan, buy add-ons on top, and can apply discount codes. The complexity comes from how these interact: a downgrade can conflict with active staff seats, a payment failure puts the clinic in a grace period, a discount might apply to the base plan but not to add-ons. These aren't edge cases — they're the normal operation of a real billing system.

---

## Stack

| Layer | Tech | Why |
|---|---|---|
| Mobile | React Native + Expo | Cross-platform, fast iteration, Expo Router handles navigation cleanly |
| Backend | Firebase (Firestore + Functions + Auth) | Real-time subscriptions, generous free tier for dev, emulator makes local dev fast |
| Payments | Stripe | Industry standard, excellent webhook tooling, test mode is solid |
| State | Zustand | Minimal boilerplate, works well with Firebase's real-time model |
| Language | TypeScript strict | Non-negotiable. If a type is `any`, it's a TODO. |

---

## Getting started

You need: Node 18+, the Firebase CLI, and Expo CLI.

```bash
# Install Firebase CLI if you don't have it
npm install -g firebase-tools

# Install Expo CLI
npm install -g expo-cli

# Clone and install
git clone https://github.com/blackcode-sa/hiring-test-2026
cd hiring-test-2026
npm install

# Copy env and fill in your values
cp .env.example .env
# For local dev, EXPO_PUBLIC_USE_EMULATOR=true — no real Firebase project needed.
# Get Stripe test keys from https://dashboard.stripe.com/test/apikeys

# Install function dependencies
cd functions && npm install && cd ..

# Start the emulator (Firestore + Auth + Functions on localhost)
npm run emulator

# In a second terminal: seed the emulator with test data
npm run seed

# In a third terminal: start the app
npm start
```

Five minutes, start to finish. If it takes longer, something is wrong — open an issue.

**Test accounts** (all passwords: `test1234`):
- Owner: `sophie.owner@test.com`
- Staff: `anna.staff@test.com` / `marc.staff@test.com`
- Patients: `patient1@test.com` / `patient2@test.com`

---

## What to implement

There are 6 scenarios. Each one has a `// TODO [CHALLENGE]:` comment in the relevant file pointing you at exactly where the implementation goes. You don't have to implement all 6 — depth matters more than breadth. Two scenarios done properly beats six scenarios half-done.

For **every decision you make**, write it down in a `DECISIONS.md` file at the repo root. We're not looking for perfect answers — we're looking for reasoning. If you queued the downgrade instead of blocking it, tell us why. If you picked token revocation over Firestore rule checks, tell us the trade-off you considered.

---

### Scenario 1 — Plan upgrade

User upgrades from Free → Pro mid-cycle.

- Stripe handles proration
- Firestore reflects new plan immediately on webhook confirmation (not before)
- New seat limit available immediately after webhook processes

**Where to look:** `src/services/stripe.ts` → `createCheckoutSession`, `functions/src/stripe/checkout.ts`, `functions/src/stripe/webhook.ts` → `handleCheckoutCompleted`

---

### Scenario 2 — Downgrade with seat conflict

Clinic on Premium (15 seats, 10 used) downgrades to Pro (5 seats).

- System detects: 10 active staff, only 5 seats allowed
- **You decide:** block the downgrade until staff are deactivated, OR queue it for end of billing period
- Firestore rules must enforce the seat limit regardless of UI state
- Document your decision in `DECISIONS.md`

**Where to look:** `src/services/stripe.ts` → `initiateDowngrade`, `functions/src/stripe/checkout.ts` → `initiateDowngrade`, `firestore.rules` → seats section

---

### Scenario 3 — Add-on purchase with discount interaction

Clinic purchases Extra Storage add-on. They have two discount codes active:
- `WELCOME20`: 20% off base plan **only** (does not apply to add-ons)
- `ADDONS15`: 15% off all add-ons (expired — see Scenario 5)

The discount logic must be enforced server-side. The client sends the code; the function validates what it applies to.

**Where to look:** `src/types/discount.ts` → `calculateDiscountedPrice`, `functions/src/stripe/checkout.ts` → `purchaseAddon`

---

### Scenario 4 — Payment failure

Stripe sends `invoice.payment_failed`.

- System enters a **grace period** (you decide how long — document it)
- During grace period: existing features stay, no new staff can be added
- After grace period ends: plan reverts to Free, excess staff seats deactivated
- Firestore rules must enforce the grace period state without needing UI changes

**Where to look:** `functions/src/stripe/webhook.ts` → `invoice.payment_failed` handler, `firestore.rules` → seats section

---

### Scenario 5 — Expired discount code

A discount has `validUntil` in the past.

- New subscribers: code rejected at checkout
- Existing subscribers who applied it: **you decide** — honor until renewal, or strip on next invoice? Document it.
- The UI must make the expiry state visible (there's a `DiscountTag` component that partially handles this)

**Where to look:** `src/types/discount.ts` → `isDiscountValid`, `functions/src/stripe/checkout.ts` → discount validation, `src/components/DiscountTag.tsx`

---

### Scenario 6 — Session invalidation on role change

Staff member is removed by owner. Their Firebase Auth session is still active on their device.

The system must block their access without requiring them to log out manually.

- Option A: `admin.auth().revokeRefreshTokens(uid)` — server-side token revocation
- Option B: Firestore rule check on every protected operation (check `active` flag in seats collection)
- Option C: Custom claims with a `disabled` field, checked in rules

Pick one. Implement it. Document the trade-offs.

**Where to look:** `src/services/auth.ts` → `revokeUserSession`, `functions/src/stripe/checkout.ts` → `removeStaffMember`, `firestore.rules` → seats section

---

## Evaluation criteria

| Area | What we're looking for |
|---|---|
| Data model | Can it represent all 6 scenarios without hacking? Is the schema clean? |
| Firestore rules | Are they actually enforced server-side? Do they hold under edge cases? |
| Stripe integration | Is the webhook handler real? Is plan gating server-side (not just UI)? |
| Discount logic | Is the interaction model correct and extensible? |
| Design decisions | Are they documented? Are the trade-offs understood? |
| React Native quality | TypeScript strict throughout, clean components, no magic strings |
| Code quality | Readable, structured, consistent — someone else can work in it |
| README | Can we run it in under 5 minutes? |

We're a small team. Code that's clear and opinionated is more valuable to us than code that's clever and fragile.

---

## How to submit

1. Fork this repo
2. Implement what you can — depth over breadth
3. Write your `DECISIONS.md` — this matters as much as the code
4. Send your fork link to **andrea@blackcode.ch**

We read every submission. If your thinking is interesting, we'll be in touch — even if the implementation isn't complete.
