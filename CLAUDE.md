# Renderize — CLAUDE.md

MicroSaaS de renderização de imagens com IA. Stack: Supabase (Postgres + Auth + Edge Functions) + Stripe + fal.ai.

## Estrutura do projeto

```
supabase/
  migrations/
    001_profiles.sql          — tabela profiles + trigger de criação automática
    002_subscriptions.sql     — tabela subscriptions (Stripe-linked)
    003_credits_renders.sql   — tabela credits, credit_transactions, renders
    004_rls.sql               — Row Level Security em todas as tabelas
    005_helper_functions.sql  — stored functions: deduct_credits, add_credits, get_user_status
  functions/
    check-subscription/       — retorna status da assinatura + saldo de créditos
    process-render/           — submete render ao fal.ai, debita créditos
    create-checkout/          — cria Stripe Checkout Session (assinatura ou créditos)
    stripe-webhook/           — processa eventos Stripe (subscription, payment)
    customer-portal/          — cria Stripe Billing Portal session
docs/
  ai-providers.md             — documentação de providers e modelos disponíveis
```

## Modelo de negócio

- **Híbrido**: assinatura mensal (créditos mensais inclusos) + compra avulsa de créditos extras
- 1 render = 1 crédito (configurável via `CREDITS_PER_RENDER` em `process-render`)
- 5 créditos grátis no signup (migration 003)

## Secrets necessários (Supabase)

```
SUPABASE_URL               — provido automaticamente
SUPABASE_SERVICE_ROLE_KEY  — provido automaticamente
FAL_API_KEY                — fal.ai API key
STRIPE_SECRET_KEY          — Stripe secret key (sk_live_... ou sk_test_...)
STRIPE_WEBHOOK_SECRET      — Stripe webhook signing secret (whsec_...)
```

## Comandos úteis

```bash
# rodar migrations
supabase db push

# fazer deploy de todas as functions
supabase functions deploy

# definir secrets
supabase secrets set FAL_API_KEY=... STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...

# ver logs de uma function
supabase functions logs process-render --tail
```

## Preços Stripe a configurar

Em `stripe-webhook/index.ts` e `create-checkout/index.ts`, mapeie seus price IDs do Stripe:

```ts
const CREDIT_PACKS = {
  'price_xxx': 100,   // pacote 100 créditos
  'price_yyy': 500,   // pacote 500 créditos
}

const PLAN_CREDITS = {
  'price_starter_monthly': { plan: 'starter', credits: 50, render_limit: 50 },
  'price_pro_monthly':     { plan: 'pro',     credits: 200, render_limit: 200 },
}
```
