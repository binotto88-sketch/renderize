-- 002: subscriptions (Stripe-linked)
create type public.subscription_status as enum (
  'active', 'canceled', 'past_due', 'trialing', 'incomplete', 'inactive'
);

create type public.subscription_plan as enum (
  'free', 'starter', 'pro', 'enterprise'
);

create table public.subscriptions (
  id                      uuid default gen_random_uuid() primary key,
  user_id                 uuid references public.profiles(id) on delete cascade not null,
  stripe_subscription_id  text unique,
  stripe_price_id         text,
  plan                    subscription_plan default 'free',
  status                  subscription_status default 'inactive',
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean default false,
  monthly_render_limit    integer default 10,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index subscriptions_user_id_idx on public.subscriptions(user_id);

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();
