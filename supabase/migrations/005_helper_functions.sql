-- 005: helper stored functions called by edge functions

-- deduct credits atomically; returns false if insufficient balance
create or replace function public.deduct_credits(
  p_user_id   uuid,
  p_amount    integer,
  p_render_id uuid default null,
  p_desc      text default 'Image render'
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_balance integer;
begin
  select balance into v_balance from public.credits where user_id = p_user_id for update;
  if v_balance is null or v_balance < p_amount then
    return false;
  end if;

  update public.credits set balance = balance - p_amount where user_id = p_user_id;

  insert into public.credit_transactions (user_id, amount, type, description, render_id)
  values (p_user_id, -p_amount, 'usage', p_desc, p_render_id);

  return true;
end;
$$;

-- add credits (purchase or grant)
create or replace function public.add_credits(
  p_user_id   uuid,
  p_amount    integer,
  p_type      credit_transaction_type default 'purchase',
  p_desc      text default null,
  p_stripe_pi text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.credits (user_id, balance, lifetime_purchased)
  values (p_user_id, p_amount, case when p_type = 'purchase' then p_amount else 0 end)
  on conflict (user_id) do update set
    balance            = public.credits.balance + p_amount,
    lifetime_purchased = public.credits.lifetime_purchased +
                         case when p_type = 'purchase' then p_amount else 0 end;

  insert into public.credit_transactions (user_id, amount, type, description, stripe_payment_intent_id)
  values (p_user_id, p_amount, p_type, p_desc, p_stripe_pi);
end;
$$;

-- get user's active subscription with credits summary
create or replace function public.get_user_status(p_user_id uuid)
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'subscription', row_to_json(s),
    'credits',      row_to_json(c)
  )
  from public.subscriptions s
  join public.credits c on c.user_id = s.user_id
  where s.user_id = p_user_id
  limit 1;
$$;
