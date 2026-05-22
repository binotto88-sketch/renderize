import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

// credit amounts per Stripe price ID — keep in sync with create-checkout
const CREDIT_PACKS: Record<string, number> = {
  'price_1TZh8oGepZ6oe09q9DZej1L5': 50,   // Pack 50 créditos — R$19
  'price_1TZhAdGepZ6oe09q3SIKcap6': 200,  // Pack 200 créditos — R$49
  'price_1TZhB1GepZ6oe09qB7j9AC94': 500,  // Pack 500 créditos — R$99
}

// monthly credits per plan price ID
const PLAN_CREDITS: Record<string, { plan: string; credits: number; render_limit: number }> = {
  'price_1TZh5FGepZ6oe09qD1UYevQw': { plan: 'starter', credits: 50,  render_limit: 50  },  // Starter — R$19/mês
  'price_1TZh8GGepZ6oe09qDpCOde5K': { plan: 'pro',     credits: 200, render_limit: 200 },  // Pro — R$49/mês
}

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    return new Response(`Webhook error: ${err instanceof Error ? err.message : err}`, { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.supabase_user_id
      if (!userId) break

      if (session.mode === 'payment') {
        // one-time credit purchase
        const priceId = session.metadata?.price_id ?? ''
        const credits = CREDIT_PACKS[priceId]
        if (credits) {
          await supabase.rpc('add_credits', {
            p_user_id: userId,
            p_amount: credits,
            p_type: 'purchase',
            p_desc: `Bought ${credits} credits`,
            p_stripe_pi: session.payment_intent as string,
          })
        }
      }
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.supabase_user_id
      if (!userId) break

      const priceId = sub.items.data[0]?.price.id ?? ''
      const planInfo = PLAN_CREDITS[priceId]
      const status = sub.status as string

      await supabase.from('subscriptions').upsert({
        user_id: userId,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        plan: planInfo?.plan ?? 'starter',
        status: status === 'active' || status === 'trialing' ? status : 'inactive',
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        monthly_render_limit: planInfo?.render_limit ?? 50,
      }, { onConflict: 'stripe_subscription_id' })

      // grant monthly credits when subscription activates
      if (event.type === 'customer.subscription.created' && planInfo?.credits) {
        await supabase.rpc('add_credits', {
          p_user_id: userId,
          p_amount: planInfo.credits,
          p_type: 'subscription_grant',
          p_desc: `Monthly credits — ${planInfo.plan} plan`,
        })
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await supabase.from('subscriptions')
        .update({ status: 'canceled', plan: 'free' })
        .eq('stripe_subscription_id', sub.id)
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
})
