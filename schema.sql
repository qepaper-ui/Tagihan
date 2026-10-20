-- Sistem tagihan QR/transfer manual — jalankan di Supabase SQL Editor.
-- PENTING: jalankan schema ini pada project baru/yang sudah dicadangkan.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('admin','customer')),
  account_status text not null default 'pending' check (account_status in ('pending','approved','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  title text not null,
  amount bigint not null check (amount > 0),
  due_date date not null,
  note text,
  status text not null default 'unpaid' check (status in ('unpaid','paid','cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_submission_id uuid
);

create table if not exists public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id),
  customer_id uuid not null references public.profiles(id),
  claimed_amount bigint not null check (claimed_amount > 0),
  method text not null check (method in ('GoPay','Transfer bank','QRIS')),
  reference text,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invoices_customer_idx on public.invoices(customer_id, due_date);
create index if not exists payment_submissions_status_idx on public.payment_submissions(status, created_at desc);
create index if not exists payment_submissions_invoice_idx on public.payment_submissions(invoice_id);

-- Auto-create customer profile after signup. Never take role from client metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, full_name, phone, role, account_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'phone',''),
    'customer',
    'pending'
  ) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.account_status = 'approved');
$$;

alter table public.profiles enable row level security;
alter table public.invoices enable row level security;
alter table public.payment_submissions enable row level security;

drop policy if exists "profiles select own or admin" on public.profiles;
create policy "profiles select own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "customer sees own invoices, admin sees all" on public.invoices;
create policy "customer sees own invoices, admin sees all" on public.invoices for select to authenticated
using ((customer_id = auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='approved')) or public.is_admin());

drop policy if exists "admin creates invoices" on public.invoices;
create policy "admin creates invoices" on public.invoices for insert to authenticated
with check (public.is_admin() and exists(select 1 from public.profiles p where p.id=customer_id and p.role='customer' and p.account_status='approved'));

drop policy if exists "customer sees own submissions, admin sees all" on public.payment_submissions;
create policy "customer sees own submissions, admin sees all" on public.payment_submissions for select to authenticated
using ((customer_id = auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='approved')) or public.is_admin());

drop policy if exists "customer submits own unpaid invoice payment" on public.payment_submissions;
create policy "customer submits own unpaid invoice payment" on public.payment_submissions for insert to authenticated
with check (
  customer_id = auth.uid()
  and status = 'pending'
  and reviewed_by is null and reviewed_at is null
  and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='customer' and p.account_status='approved')
  and exists(select 1 from public.invoices i where i.id=invoice_id and i.customer_id=auth.uid() and i.status='unpaid')
);

-- No customer UPDATE policies are created for invoices/profiles/submissions.
-- Approvals are performed only through admin-checked RPCs.

create or replace function public.admin_review_customer(p_customer_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Akses admin diperlukan'; end if;
  if p_status not in ('approved','suspended') then raise exception 'Status tidak valid'; end if;
  update public.profiles set account_status=p_status
  where id=p_customer_id and role='customer';
  if not found then raise exception 'Customer tidak ditemukan'; end if;
end;
$$;

create or replace function public.admin_review_payment(p_submission_id uuid, p_decision text, p_admin_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare s public.payment_submissions%rowtype;
begin
  if not public.is_admin() then raise exception 'Akses admin diperlukan'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Keputusan tidak valid'; end if;
  select * into s from public.payment_submissions where id=p_submission_id for update;
  if not found then raise exception 'Konfirmasi tidak ditemukan'; end if;
  if s.status <> 'pending' then raise exception 'Konfirmasi sudah diproses'; end if;
  if p_decision='approved' then
    update public.invoices set status='paid', paid_at=now(), paid_submission_id=s.id
      where id=s.invoice_id and customer_id=s.customer_id and status='unpaid';
    if not found then raise exception 'Invoice tidak tersedia atau sudah lunas'; end if;
  end if;
  update public.payment_submissions
    set status=p_decision, admin_note=nullif(left(coalesce(p_admin_note,''),500),''),
        reviewed_by=auth.uid(), reviewed_at=now()
    where id=s.id;
end;
$$;

create or replace function public.admin_cancel_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Akses admin diperlukan'; end if;
  update public.invoices set status='cancelled'
  where id=p_invoice_id and status='unpaid';
  if not found then raise exception 'Invoice tidak ditemukan, sudah lunas, atau tidak bisa dibatalkan'; end if;
end;
$$;

revoke all on function public.admin_review_customer(uuid,text) from public;
revoke all on function public.admin_review_payment(uuid,text,text) from public;
revoke all on function public.admin_cancel_invoice(uuid) from public;
grant execute on function public.admin_review_customer(uuid,text) to authenticated;
grant execute on function public.admin_review_payment(uuid,text,text) to authenticated;
grant execute on function public.admin_cancel_invoice(uuid) to authenticated;

grant select on public.profiles, public.invoices, public.payment_submissions to authenticated;
grant insert on public.payment_submissions to authenticated;
grant insert on public.invoices to authenticated;

-- Setup admin after registering an account and confirming email:
-- 1) In Supabase SQL Editor, replace the email below and run this query.
-- 2) Only do this for an account you control.
-- update public.profiles p
-- set role='admin', account_status='approved'
-- from auth.users u
-- where p.id=u.id and lower(u.email)=lower('EMAIL_ADMIN_ANDA');
