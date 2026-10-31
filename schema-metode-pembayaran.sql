-- Jalankan SEKALI di Supabase > SQL Editor (setelah schema.sql). Aman diulang.
-- 1) Longgarkan batas kolom method agar bisa memuat metode buatan admin.
do $$ declare c text; begin
  for c in select conname from pg_constraint
    where conrelid='public.payment_submissions'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%method%'
  loop execute format('alter table public.payment_submissions drop constraint %I',c); end loop;
end $$;
alter table public.payment_submissions add constraint payment_submissions_method_len check (char_length(method) between 1 and 40);

-- 2) Tabel metode pembayaran.
create table if not exists public.payment_methods(
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  account_name text check (char_length(account_name) <= 80),
  account_number text check (char_length(account_number) <= 80),
  instructions text check (char_length(instructions) <= 300),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  qr_url text check (qr_url is null or qr_url ~ '^https://'),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.payment_methods enable row level security;
drop policy if exists "methods select active or admin" on public.payment_methods;
drop policy if exists "admin inserts methods" on public.payment_methods;
drop policy if exists "admin updates methods" on public.payment_methods;
drop policy if exists "admin deletes methods" on public.payment_methods;
create policy "methods select active or admin" on public.payment_methods for select to authenticated using (is_active or public.is_admin());
create policy "admin inserts methods" on public.payment_methods for insert to authenticated with check (public.is_admin());
create policy "admin updates methods" on public.payment_methods for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes methods" on public.payment_methods for delete to authenticated using (public.is_admin());
