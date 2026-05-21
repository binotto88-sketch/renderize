-- 004: Row Level Security
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credits enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.renders enable row level security;

-- profiles: users see and edit only their own row
create policy "profiles: own row" on public.profiles
  for all using (auth.uid() = id);

-- subscriptions: own row
create policy "subscriptions: own row" on public.subscriptions
  for all using (auth.uid() = user_id);

-- credits: own row
create policy "credits: own row" on public.credits
  for all using (auth.uid() = user_id);

-- credit_transactions: own rows, insert via service role only
create policy "credit_transactions: read own" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- renders: own rows
create policy "renders: own rows" on public.renders
  for all using (auth.uid() = user_id);

-- allow service role to bypass RLS (edge functions use service role key)
