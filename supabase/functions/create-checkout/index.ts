import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// credit packs: price_id -> credits amount (configure in Stripe dashboard)
const CREDIT_PACKS: Record<string, number> = {
  'price_1TZh8oGepZ6oe09q9DZej1L5': 50,   // Pack 50 créditos — R$19
  'price_1TZhAdGepZ6oe09q3SIKcap6': 200,  // Pack 200 créditos — R$49
  'price_1TZhB1GepZ6oe09qB7j9AC94': 500,  // Pack 500 créditos — R$99
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  const { price_id, mode = 'subscription', success_url, cancel_url } = await req.json()
  if (!price_id) return new Response(JSON.stringify({ error: 'price_id is required' }), { status: 400, headers: corsHeaders })

  // get or create stripe customer
  const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single()
  let customerId = profile?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email!, metadata: { supabase_user_id: user.id } })
    customerId = customer.id
    await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  const sessionMode = mode === 'payment' ? 'payment' : 'subscription'
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: sessionMode,
    line_items: [{ price: price_id, quantity: 1 }],
    success_url: success_url ?? `${req.headers.get('origin')}/dashboard?checkout=success`,
    cancel_url: cancel_url ?? `${req.headers.get('origin')}/pricing`,
    metadata: { supabase_user_id: user.id, price_id },
    ...(sessionMode === 'subscription' && { subscription_data: { metadata: { supabase_user_id: user.id } } }),
  })

  return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
