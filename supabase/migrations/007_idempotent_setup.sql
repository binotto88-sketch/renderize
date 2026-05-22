-- 007: idempotent setup — aplica todo o schema com segurança em bancos existentes
-- Pode ser rodado no SQL Editor do Supabase mesmo se algumas tabelas já existirem.

-- ── tipos ENUM ───────────────────────────────────────────────────────────────

do $$ begin
  create type public.subscription_status as enum (
    'active', 'canceled', 'past_due', 'trialing', 'incomplete', 'inactive'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_plan as enum (
    'free', 'starter', 'pro', 'enterprise'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.credit_transaction_type as enum (
    'purchase', 'usage', 'refund', 'bonus', 'subscription_grant'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.render_status as enum (
    'pending', 'processing', 'completed', 'failed'
  );
exception when duplicate_object then null;
end $$;

-- ── funções utilitárias ───────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── tabela: profiles ─────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id                 uuid references auth.users(id) on delete cascade primary key,
  email              text not null,
  full_name          text,
  avatar_url         text,
  stripe_customer_id text unique,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- adiciona colunas que podem faltar em um profiles criado pelo Lovable
alter table public.profiles
  add column if not exists full_name          text,
  add column if not exists avatar_url         text,
  add column if not exists stripe_customer_id text;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── tabela: subscriptions ────────────────────────────────────────────────────

create table if not exists public.subscriptions (
  id                      uuid default gen_random_uuid() primary key,
  user_id                 uuid references public.profiles(id) on delete cascade not null,
  stripe_subscription_id  text unique,
  stripe_price_id         text,
  plan                    public.subscription_plan default 'free',
  status                  public.subscription_status default 'inactive',
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean default false,
  monthly_render_limit    integer default 10,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();

-- ── tabela: credits ───────────────────────────────────────────────────────────

create table if not exists public.credits (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references public.profiles(id) on delete cascade not null unique,
  balance             integer default 0 check (balance >= 0),
  lifetime_purchased  integer default 0,
  updated_at          timestamptz default now()
);

drop trigger if exists credits_updated_at on public.credits;
create trigger credits_updated_at
  before update on public.credits
  for each row execute procedure public.set_updated_at();

-- ── tabela: credit_transactions ──────────────────────────────────────────────

create table if not exists public.credit_transactions (
  id                        uuid default gen_random_uuid() primary key,
  user_id                   uuid references public.profiles(id) on delete cascade not null,
  amount                    integer not null,
  type                      public.credit_transaction_type not null,
  description               text,
  stripe_payment_intent_id  text,
  render_id                 uuid,
  created_at                timestamptz default now()
);

create index if not exists credit_transactions_user_id_idx  on public.credit_transactions(user_id);
create index if not exists credit_transactions_created_at_idx on public.credit_transactions(created_at desc);

-- ── tabela: renders ───────────────────────────────────────────────────────────

create table if not exists public.renders (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references public.profiles(id) on delete cascade not null,
  prompt          text not null,
  negative_prompt text,
  model           text not null default 'fal-ai/flux/dev',
  width           integer default 1024 check (width between 256 and 2048),
  height          integer default 1024 check (height between 256 and 2048),
  steps           integer default 28 check (steps between 1 and 100),
  guidance_scale  numeric default 3.5,
  seed            bigint,
  status          public.render_status default 'pending',
  image_url       text,
  fal_request_id  text,
  credits_used    integer default 1,
  error_message   text,
  metadata        jsonb default '{}',
  created_at      timestamptz default now(),
  completed_at    timestamptz
);

create index if not exists renders_user_id_idx   on public.renders(user_id);
create index if not exists renders_status_idx    on public.renders(status);
create index if not exists renders_created_at_idx on public.renders(created_at desc);

-- colunas arquitetônicas (idempotente)
alter table public.renders
  add column if not exists render_type          text default 'text-to-image',
  add column if not exists reference_image_url  text,
  add column if not exists style_preset         text,
  add column if not exists perspective          text,
  add column if not exists time_of_day          text,
  add column if not exists atmosphere           text,
  add column if not exists environment          text,
  add column if not exists typology             text,
  add column if not exists enhanced_prompt      text;

-- ── trigger: criar credits + subscription ao criar profile ───────────────────

create or replace function public.handle_new_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.credits (user_id, balance) values (new.id, 5)
  on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id, plan, status) values (new.id, 'free', 'active')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.handle_new_profile();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.profiles          enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.credits           enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.renders           enable row level security;

drop policy if exists "profiles: own row"             on public.profiles;
drop policy if exists "subscriptions: own row"        on public.subscriptions;
drop policy if exists "credits: own row"              on public.credits;
drop policy if exists "credit_transactions: read own" on public.credit_transactions;
drop policy if exists "renders: own rows"             on public.renders;

create policy "profiles: own row"
  on public.profiles for all using (auth.uid() = id);

create policy "subscriptions: own row"
  on public.subscriptions for all using (auth.uid() = user_id);

create policy "credits: own row"
  on public.credits for all using (auth.uid() = user_id);

create policy "credit_transactions: read own"
  on public.credit_transactions for select using (auth.uid() = user_id);

create policy "renders: own rows"
  on public.renders for all using (auth.uid() = user_id);

-- ── funções helper ────────────────────────────────────────────────────────────

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

create or replace function public.add_credits(
  p_user_id   uuid,
  p_amount    integer,
  p_type      public.credit_transaction_type default 'purchase',
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

-- ── bootstrap: garante credits e subscription para usuários já existentes ─────

insert into public.credits (user_id, balance)
select id, 5 from public.profiles
where id not in (select user_id from public.credits);

insert into public.subscriptions (user_id, plan, status)
select id, 'free', 'active' from public.profiles
where id not in (select user_id from public.subscriptions);
