import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as fal from 'https://esm.sh/@fal-ai/serverless-client@0.15'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// credits debited per model — higher quality = more credits
const MODEL_CREDITS: Record<string, number> = {
  'fal-ai/flux/schnell':           1,
  'fal-ai/flux/dev':               1,
  'fal-ai/flux/dev/image-to-image': 1,
  'fal-ai/flux-pro':               2,
  'fal-ai/flux-pro/v1.1':          2,
  'fal-ai/flux-pro/canny':         2,
  'fal-ai/flux-pro/depth':         2,
  'fal-ai/flux-pro/v1.1-ultra':    3,
}

// models that accept an input image
const IMAGE_INPUT_MODELS = new Set([
  'fal-ai/flux/dev/image-to-image',
  'fal-ai/flux-pro/canny',
  'fal-ai/flux-pro/depth',
])

// ── architectural vocabulary ─────────────────────────────────────────────────

const STYLE_PRESETS: Record<string, string> = {
  contemporary:  'contemporary architecture, clean geometric lines, modern materials, open floor plan',
  minimalist:    'minimalist architecture, pure forms, restrained palette, void and solid contrast',
  brutalist:     'brutalist architecture, exposed raw concrete, bold geometric masses, monumental scale',
  neoclassical:  'neoclassical architecture, columns, symmetry, classical proportions, ornamental details',
  biophilic:     'biophilic architecture, green walls, natural materials, integration with nature, organic forms',
  industrial:    'industrial architecture, exposed steel structure, raw materials, loft aesthetic',
  tropical:      'tropical modern architecture, deep overhangs, natural ventilation, local wood, lush vegetation',
  japanese:      'japanese minimalist architecture, wabi-sabi, natural wood, zen garden, interior-exterior flow',
}

const PERSPECTIVES: Record<string, string> = {
  exterior_facade: 'exterior facade, frontal elevation, architectural photography',
  exterior_corner: 'exterior corner view, two-point perspective, building volumes',
  interior:        'interior architectural photography, interior perspective, inside space',
  aerial:          'aerial view, bird\'s eye perspective, drone photography, top-down architectural view',
  street_level:    'street level perspective, human scale, urban context eye level view',
  garden:          'garden perspective, back exterior view, landscape foreground',
}

const TIME_OF_DAY: Record<string, string> = {
  golden_hour: 'golden hour lighting, warm late afternoon sun, long shadows, warm amber tones',
  midday:      'midday sun, clear direct light, bright blue sky, sharp contrasted shadows',
  dusk:        'blue hour, dusk atmosphere, interior lights on, dramatic gradient sky',
  night:       'night scene, architectural lighting design, dark sky, lit interior, dramatic illumination',
  overcast:    'overcast sky, soft diffused lighting, no harsh shadows, uniform natural light',
  dawn:        'dawn light, cool morning atmosphere, mist, first light of day, gentle colors',
}

const ATMOSPHERES: Record<string, string> = {
  clear:    'crystal clear sky, vibrant colors, high visibility, pristine atmosphere',
  dramatic: 'dramatic clouds, cinematic atmosphere, moody lighting, high contrast',
  foggy:    'morning fog, misty atmosphere, ethereal quality, reduced visibility layers',
  rainy:    'rainy day, wet surfaces, reflections on pavement, moody overcast',
}

const ENVIRONMENTS: Record<string, string> = {
  urban:     'dense urban context, city fabric, street activity, neighboring buildings',
  suburban:  'suburban setting, residential neighborhood, quiet tree-lined street',
  nature:    'natural setting, trees surrounding, forest context, green landscape',
  waterfront:'waterfront location, sea or river view, coastal setting, reflective water',
  desert:    'desert landscape, arid environment, sand dunes, minimal sparse vegetation',
  mountain:  'mountain setting, alpine landscape, rocky terrain, elevated site',
}

const QUALITY_SUFFIX =
  'professional architectural visualization, photorealistic render, 8K resolution, ' +
  'high dynamic range, sharp focus, architectural photography, highly detailed, ' +
  'studio lighting, ray tracing, award-winning design'

const DEFAULT_NEGATIVE =
  'blurry, low quality, distorted, deformed, cartoon, anime, illustration, ' +
  'painted, sketch, ugly, bad proportions, unrealistic, watermark, text, logo, ' +
  'duplicate, morbid, mutilated, poorly drawn, out of frame, extra elements'

// ── prompt builder ───────────────────────────────────────────────────────────

function buildArchitecturalPrompt(params: {
  prompt: string
  style_preset?: string
  perspective?: string
  time_of_day?: string
  atmosphere?: string
  environment?: string
  typology?: string
}): string {
  const parts: string[] = []

  if (params.typology) parts.push(params.typology)
  parts.push(params.prompt)
  if (params.style_preset && STYLE_PRESETS[params.style_preset]) parts.push(STYLE_PRESETS[params.style_preset])
  if (params.perspective && PERSPECTIVES[params.perspective])   parts.push(PERSPECTIVES[params.perspective])
  if (params.time_of_day && TIME_OF_DAY[params.time_of_day])   parts.push(TIME_OF_DAY[params.time_of_day])
  if (params.atmosphere && ATMOSPHERES[params.atmosphere])      parts.push(ATMOSPHERES[params.atmosphere])
  if (params.environment && ENVIRONMENTS[params.environment])   parts.push(ENVIRONMENTS[params.environment])
  parts.push(QUALITY_SUFFIX)

  return parts.join(', ')
}

// ── fal.ai input builder ─────────────────────────────────────────────────────

function buildFalInput(model: string, params: {
  enhanced_prompt: string
  negative_prompt?: string
  width: number
  height: number
  steps: number
  guidance_scale: number
  seed?: number
  reference_image_url?: string
  strength?: number
}) {
  const base = {
    prompt:           params.enhanced_prompt,
    negative_prompt:  params.negative_prompt ?? DEFAULT_NEGATIVE,
    guidance_scale:   params.guidance_scale,
    ...(params.seed != null && { seed: params.seed }),
  }

  if (model === 'fal-ai/flux/dev/image-to-image') {
    return {
      ...base,
      image_url:            params.reference_image_url,
      strength:             params.strength ?? 0.85,
      num_inference_steps:  params.steps,
    }
  }

  if (model === 'fal-ai/flux-pro/canny' || model === 'fal-ai/flux-pro/depth') {
    return {
      ...base,
      control_image_url: params.reference_image_url,
      strength:          params.strength ?? 0.9,
    }
  }

  if (model === 'fal-ai/flux-pro/v1.1-ultra') {
    return {
      ...base,
      aspect_ratio: params.width > params.height
        ? '16:9'
        : params.width === params.height ? '1:1' : '9:16',
    }
  }

  return {
    ...base,
    image_size:           { width: params.width, height: params.height },
    num_inference_steps:  params.steps,
  }
}

// ── handler ──────────────────────────────────────────────────────────────────

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
  console.log('request body keys:', Object.keys(body))
  const {
    prompt: promptField,
    description,
    negative_prompt,
    model = 'fal-ai/flux/dev',
    width = 1920,
    height = 1080,
    steps = 28,
    guidance_scale = 3.5,
    seed,
    // architectural params
    render_type = 'text-to-image',
    reference_image_url,
    style_preset,
    perspective,
    time_of_day,
    atmosphere,
    environment,
    typology,
    strength,
  } = body

  // accept 'description' as alias for 'prompt' (Lovable may use different field name)
  const prompt = promptField ?? description ?? body.text ?? body.query
  console.log('prompt received:', prompt)

  if (!prompt) return new Response(JSON.stringify({ error: 'prompt is required' }), { status: 400, headers: corsHeaders })

  if (IMAGE_INPUT_MODELS.has(model) && !reference_image_url) {
    return new Response(
      JSON.stringify({ error: `Model ${model} requires a reference_image_url (sketch or photo)` }),
      { status: 400, headers: corsHeaders },
    )
  }

  const enhanced_prompt = buildArchitecturalPrompt({ prompt, style_preset, perspective, time_of_day, atmosphere, environment, typology })
  const credits_used = MODEL_CREDITS[model] ?? 1

  const { data: render, error: insertError } = await supabase
    .from('renders')
    .insert({
      user_id: user.id,
      prompt,
      negative_prompt,
      model,
      width,
      height,
      steps,
      guidance_scale,
      seed,
      credits_used,
      render_type,
      reference_image_url,
      style_preset,
      perspective,
      time_of_day,
      atmosphere,
      environment,
      typology,
      enhanced_prompt,
    })
    .select()
    .single()

  if (insertError) return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: corsHeaders })

  const { data: deducted } = await supabase.rpc('deduct_credits', {
    p_user_id:  user.id,
    p_amount:   credits_used,
    p_render_id: render.id,
    p_desc:     `Render: ${prompt.slice(0, 60)}`,
  })

  if (!deducted) {
    await supabase.from('renders').update({ status: 'failed', error_message: 'Insufficient credits' }).eq('id', render.id)
    return new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402, headers: corsHeaders })
  }

  await supabase.from('renders').update({ status: 'processing' }).eq('id', render.id)

  try {
    const falInput = buildFalInput(model, {
      enhanced_prompt,
      negative_prompt,
      width,
      height,
      steps,
      guidance_scale,
      seed,
      reference_image_url,
      strength,
    })

    const result = await fal.run(model, { input: falInput }) as { images: Array<{ url: string }> }
    const imageUrl = result.images?.[0]?.url

    await supabase
      .from('renders')
      .update({ status: 'completed', image_url: imageUrl, completed_at: new Date().toISOString() })
      .eq('id', render.id)

    return new Response(
      JSON.stringify({ id: render.id, image_url: imageUrl, enhanced_prompt, credits_used, status: 'completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fal.ai error'
    await supabase.from('renders').update({ status: 'failed', error_message: message }).eq('id', render.id)
    await supabase.rpc('add_credits', { p_user_id: user.id, p_amount: credits_used, p_type: 'refund', p_desc: 'Render failed — refund' })
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
