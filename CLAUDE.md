# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Renderize is an AI image rendering MicroSaaS. Stack: Supabase (Postgres + Auth + Edge Functions) + Stripe + fal.ai.

## Business Model

- **Hybrid**: monthly subscription (includes monthly credits) + one-time credit pack purchases
- 1 render = 1 credit (controlled by `CREDITS_PER_RENDER` constant in `process-render/index.ts`)
- New users automatically receive 5 free credits and a free-plan subscription on signup (triggered by `handle_new_profile` in migration 003)

## Commands

```bash
# Apply migrations to the linked Supabase project
supabase db push

# Deploy a specific edge function
supabase functions deploy <function-name>

# Deploy all edge functions
supabase functions deploy

# Set required secrets
supabase secrets set FAL_API_KEY=fal_... STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_...

# Tail logs for a function
supabase functions logs process-render --tail

# Serve functions locally for development
supabase functions serve --env-file .env.local
```

## Architecture

### Database Schema

All tables have RLS enabled. Edge functions bypass RLS by using `SUPABASE_SERVICE_ROLE_KEY` and verify JWTs themselves.

- **`profiles`** — extends `auth.users` 1:1. Auto-created by `on_auth_user_created` trigger. Stores `stripe_customer_id`.
- **`subscriptions`** — one row per user (auto-created as `free`/`active` on signup). Tracks Stripe subscription state, plan, `monthly_render_limit`.
- **`credits`** — one row per user (auto-created with `balance=5` on signup). Has a `CHECK (balance >= 0)` constraint.
- **`credit_transactions`** — append-only ledger of every credit change. Linked to `renders` via `render_id`.
- **`renders`** — one row per render attempt. Stores all fal.ai input params plus `status`, `image_url`, `error_message`. Dimensions constrained to 256–2048 px, steps 1–100.

**Trigger chain on user signup:**
`auth.users INSERT` → `on_auth_user_created` → inserts into `profiles` → `on_profile_created` → inserts into `credits` (balance=5) + `subscriptions` (free/active)

### Edge Functions

All authenticated functions (except `stripe-webhook`) share the same auth pattern: extract `Authorization: Bearer <token>`, call `supabase.auth.getUser()` with the service role client.

| Function | Purpose | Auth |
|---|---|---|
| `check-subscription` | Returns user status via `get_user_status()` RPC | JWT |
| `process-render` | Submits to fal.ai, debits credits, records render | JWT |
| `create-checkout` | Creates Stripe Checkout Session (subscription or one-time payment) | JWT |
| `stripe-webhook` | Handles Stripe events, grants credits, updates subscriptions | Stripe signature |
| `customer-portal` | Creates Stripe Billing Portal session | JWT |

`stripe-webhook` has **no CORS headers** — it is a server-to-server endpoint only.

### Credit Flow in `process-render`

1. Insert `renders` row with `status='pending'`
2. Call `deduct_credits()` RPC — uses `SELECT ... FOR UPDATE` row lock for atomicity
3. If insufficient credits → mark render `failed`, return HTTP 402
4. Mark render `processing` → call `fal.run(model, input)`
5. On success → mark `completed`, store `image_url`
6. On fal.ai error → mark `failed`, call `add_credits()` with `type='refund'`

### Stripe Integration

`CREDIT_PACKS` and `PLAN_CREDITS` maps are defined in **both** `create-checkout/index.ts` and `stripe-webhook/index.ts` and must be kept in sync when adding price IDs.

- **Subscription**: `customer.subscription.created/updated` → upsert `subscriptions` row; monthly credits are only granted on `created`
- **Credit packs**: `checkout.session.completed` with `mode='payment'` → `add_credits()` with `type='purchase'`

### fal.ai Models

Default model: `fal-ai/flux/dev`.

| Model ID | Cost |
|---|---|
| `fal-ai/flux/dev` | ~$0.025/img |
| `fal-ai/flux/schnell` | ~$0.003/img |
| `fal-ai/stable-diffusion-v3-medium` | ~$0.035/img |
| `fal-ai/aura-flow` | ~$0.006/img |

To add a new provider, create an adapter inside `process-render/index.ts` implementing:
```ts
interface ProviderAdapter {
  run(model: string, input: RenderInput): Promise<{ imageUrl: string }>
}
```

## Required Secrets

```
SUPABASE_URL               — auto-provided
SUPABASE_SERVICE_ROLE_KEY  — auto-provided
FAL_API_KEY                — fal.ai API key
STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
STRIPE_WEBHOOK_SECRET      — whsec_...
```

## Stripe Price ID Configuration

Both `stripe-webhook/index.ts` and `create-checkout/index.ts` must have matching maps:

```ts
const CREDIT_PACKS: Record<string, number> = {
  'price_xxx': 100,   // 100 credit pack
  'price_yyy': 500,   // 500 credit pack
}

const PLAN_CREDITS: Record<string, { plan: string; credits: number; render_limit: number }> = {
  'price_starter_monthly': { plan: 'starter', credits: 50, render_limit: 50 },
  'price_pro_monthly':     { plan: 'pro',     credits: 200, render_limit: 200 },
}
```
