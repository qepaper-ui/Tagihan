-- Jalankan SEKALI di Supabase > SQL Editor. Aman diulang. Menambah dukungan cicilan pada tabel invoices.
alter table public.invoices
  add column if not exists plan_id uuid,
  add column if not exists installment_no int,
  add column if not exists installment_total int,
  add column if not exists plan_total bigint;
create index if not exists invoices_plan_idx on public.invoices(plan_id);
