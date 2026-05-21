import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as fal from 'https://esm.sh/@fal-ai/serverless-client@0.15'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CREDITS_PER_RENDER = 1

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  fal.config({ credentials: Deno.env.get('FAL_API_KEY')! })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  const body = await req.json()
  const { prompt, negative_prompt, model = 'fal-ai/flux/dev', width = 1024, height = 1024, steps = 28, guidance_scale = 3.5, seed } = body

  if (!prompt) return new Response(JSON.stringify({ error: 'prompt is required' }), { status: 400, headers: corsHeaders })

  // create render row in pending state
  const { data: render, error: insertError } = await supabase
    .from('renders')
    .insert({ user_id: user.id, prompt, negative_prompt, model, width, height, steps, guidance_scale, seed, credits_used: CREDITS_PER_RENDER })
    .select()
    .single()

  if (insertError) return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: corsHeaders })

  // deduct credits atomically
  const { data: deducted } = await supabase.rpc('deduct_credits', {
    p_user_id: user.id,
    p_amount: CREDITS_PER_RENDER,
    p_render_id: render.id,
    p_desc: `Render: ${prompt.slice(0, 60)}`,
  })

  if (!deducted) {
    await supabase.from('renders').update({ status: 'failed', error_message: 'Insufficient credits' }).eq('id', render.id)
    return new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402, headers: corsHeaders })
  }

  // mark as processing
  await supabase.from('renders').update({ status: 'processing' }).eq('id', render.id)

  try {
    const result = await fal.run(model, {
      input: {
        prompt,
        negative_prompt,
        image_size: { width, height },
        num_inference_steps: steps,
        guidance_scale,
        ...(seed != null && { seed }),
      },
    }) as { images: Array<{ url: string }> }

    const imageUrl = result.images?.[0]?.url
    await supabase.from('renders').update({ status: 'completed', image_url: imageUrl, completed_at: new Date().toISOString() }).eq('id', render.id)

    return new Response(JSON.stringify({ id: render.id, image_url: imageUrl, status: 'completed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fal.ai error'
    await supabase.from('renders').update({ status: 'failed', error_message: message }).eq('id', render.id)
    // refund credits on failure
    await supabase.rpc('add_credits', { p_user_id: user.id, p_amount: CREDITS_PER_RENDER, p_type: 'refund', p_desc: 'Render failed refund' })
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
