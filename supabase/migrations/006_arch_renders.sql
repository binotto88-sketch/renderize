-- 006: architectural rendering — colunas especializadas + get_user_status atualizado

alter table public.renders
  add column if not exists render_type       text default 'text-to-image',
  add column if not exists reference_image_url text,
  add column if not exists style_preset      text,
  add column if not exists perspective       text,
  add column if not exists time_of_day       text,
  add column if not exists atmosphere        text,
  add column if not exists environment       text,
  add column if not exists typology          text,
  add column if not exists enhanced_prompt   text;

-- get_user_status agora inclui renders do mês corrente
create or replace function public.get_user_status(p_user_id uuid)
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'subscription',       row_to_json(s),
    'credits',            row_to_json(c),
    'renders_this_month', (
      select count(*)::int from public.renders
      where user_id = p_user_id
        and status   = 'completed'
        and created_at >= date_trunc('month', now())
    )
  )
  from public.subscriptions s
  join public.credits c on c.user_id = s.user_id
  where s.user_id = p_user_id
  limit 1;
$$;
