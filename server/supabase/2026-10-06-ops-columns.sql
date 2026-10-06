-- LB jewelry — cria as colunas de operação e copia os valores do settings.ops_extras.
-- Roda tudo numa transação: as colunas já nascem preenchidas.
-- Pode rodar mais de uma vez sem problema.

begin;

alter table products add column if not exists cost numeric not null default 0;
alter table products add column if not exists sku text default '';
alter table products add column if not exists active boolean not null default true;
alter table clients add column if not exists address text default '';
alter table sales add column if not exists unit_cost numeric not null default 0;
alter table sales add column if not exists payment_method text default '';
alter table sales add column if not exists notes text default '';
alter table fiado add column if not exists unit_cost numeric not null default 0;
alter table fiado add column if not exists payment_method text default '';

update products p set
  cost = coalesce((e.value -> 'products' -> p.id ->> 'cost')::numeric, p.cost),
  sku = coalesce(e.value -> 'products' -> p.id ->> 'sku', p.sku),
  active = coalesce((e.value -> 'products' -> p.id ->> 'active')::boolean, p.active)
from settings e
where e.key = 'ops_extras' and e.value -> 'products' ? p.id;

update clients c set
  address = coalesce(e.value -> 'clients' -> c.id ->> 'address', c.address)
from settings e
where e.key = 'ops_extras' and e.value -> 'clients' ? c.id;

update sales s set
  unit_cost = coalesce((e.value -> 'sales' -> s.id ->> 'unitCost')::numeric, s.unit_cost),
  payment_method = coalesce(e.value -> 'sales' -> s.id ->> 'paymentMethod', s.payment_method),
  notes = coalesce(e.value -> 'sales' -> s.id ->> 'notes', s.notes)
from settings e
where e.key = 'ops_extras' and e.value -> 'sales' ? s.id;

update fiado f set
  unit_cost = coalesce((e.value -> 'fiado' -> f.id ->> 'unitCost')::numeric, f.unit_cost),
  payment_method = coalesce(e.value -> 'fiado' -> f.id ->> 'paymentMethod', f.payment_method)
from settings e
where e.key = 'ops_extras' and e.value -> 'fiado' ? f.id;

commit;

-- Conferência: quantas linhas ficaram com valor vindo do ops_extras.
select 'produtos com custo' as item, count(*) from products where cost > 0
union all select 'produtos inativos', count(*) from products where active = false
union all select 'vendas com forma de pagamento', count(*) from sales where payment_method <> ''
union all select 'fiados com forma de pagamento', count(*) from fiado where payment_method <> ''
union all select 'clientes com endereço', count(*) from clients where address <> '';
