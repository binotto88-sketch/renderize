-- 003: credits + renders
create table public.credits (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references public.profiles(id) on delete cascade not null unique,
  balance             integer default 0 check (balance >= 0),
  lifetime_purchased  integer default 0,
  updated_at          timestamptz default now()
);

create trigger credits_updated_at
  before update on public.credits
  for each row execute procedure public.set_updated_at();

-- auto-create credits row when profile is created
create or replace function public.handle_new_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.credits (user_id, balance) values (new.id, 5); -- 5 free credits on signup
  insert into public.subscriptions (user_id, plan, status) values (new.id, 'free', 'active');
  return new;
end;
$$;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.handle_new_profile();

create type public.credit_transaction_type as enum (
  'purchase', 'usage', 'refund', 'bonus', 'subscription_grant'
);

create table public.credit_transactions (
  id                        uuid default gen_random_uuid() primary key,
  user_id                   uuid references public.profiles(id) on delete cascade not null,
  amount                    integer not null,
  type                      credit_transaction_type not null,
  description               text,
  stripe_payment_intent_id  text,
  render_id                 uuid,
  created_at                timestamptz default now()
);

create index credit_transactions_user_id_idx on public.credit_transactions(user_id);
create index credit_transactions_created_at_idx on public.credit_transactions(created_at desc);

create type public.render_status as enum ('pending', 'processing', 'completed', 'failed');

create table public.renders (
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
  status          render_status default 'pending',
  image_url       text,
  fal_request_id  text,
  credits_used    integer default 1,
  error_message   text,
  metadata        jsonb default '{}',
  created_at      timestamptz default now(),
  completed_at    timestamptz
);

create index renders_user_id_idx on public.renders(user_id);
create index renders_status_idx on public.renders(status);
create index renders_created_at_idx on public.renders(created_at desc);
