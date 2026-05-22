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

## Preços Stripe (test mode — BRL)

| Price ID | Produto | Tipo | Valor | Créditos |
|---|---|---|---|---|
| `price_1TZh5FGepZ6oe09qD1UYevQw` | Renderize Starter | Assinatura mensal | R$19 | 50/mês |
| `price_1TZh8GGepZ6oe09qDpCOde5K` | Renderize Pro | Assinatura mensal | R$49 | 200/mês |
| `price_1TZh8oGepZ6oe09q9DZej1L5` | Pack 50 créditos | Compra única | R$19 | 50 |
| `price_1TZhAdGepZ6oe09q3SIKcap6` | Pack 200 créditos | Compra única | R$49 | 200 |
| `price_1TZhB1GepZ6oe09qB7j9AC94` | Pack 500 créditos | Compra única | R$99 | 500 |

Esses IDs já estão mapeados em `stripe-webhook/index.ts` e `create-checkout/index.ts`.
