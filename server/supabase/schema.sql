-- LB jewelry — rode no SQL Editor do Supabase (Project → SQL → New query)

create table if not exists products (
  id text primary key,
  name text not null,
  category text,
  category_slug text not null,
  collection text,
  badge text,
  price_min numeric not null default 0,
  price_max numeric not null default 0,
  price_list numeric,
  stock int not null default 0,
  show_on_home boolean not null default true,
  image text not null,
  images jsonb not null default '[]'::jsonb,
  thickness jsonb not null default '[]'::jsonb,
  description text default '',
  details jsonb not null default '[]'::jsonb
);

create table if not exists banners (
  id text primary key,
  type text not null default 'image',
  title text default '',
  alt text default '',
  image text default '',
  video text default '',
  sort_order int not null default 0
);

create table if not exists clients (
  id text primary key,
  name text not null,
  phone text not null,
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists sales (
  id text primary key,
  type text not null default 'cash',
  fiado_id text,
  client_id text references clients(id) on delete set null,
  client_name text,
  product_id text,
  product_name text,
  quantity int not null default 0,
  unit_price numeric not null default 0,
  total numeric not null default 0,
  paid_at_sale numeric,
  created_at timestamptz not null default now()
);

create table if not exists fiado (
  id text primary key,
  client_id text references clients(id) on delete set null,
  client_name text not null,
  client_phone text default '',
  product_id text,
  product_name text not null,
  quantity int not null default 1,
  unit_price numeric not null default 0,
  total numeric not null default 0,
  paid numeric not null default 0,
  balance numeric not null default 0,
  next_due_date date,
  installment_amount numeric,
  status text not null default 'open',
  notes text default '',
  payments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Storage público para fotos e vídeos enviados pelo admin
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read media'
  ) then
    create policy "Public read media"
    on storage.objects for select
    using (bucket_id = 'media');
  end if;
end $$;

alter table products enable row level security;
alter table banners enable row level security;
alter table clients enable row level security;
alter table sales enable row level security;
alter table fiado enable row level security;
