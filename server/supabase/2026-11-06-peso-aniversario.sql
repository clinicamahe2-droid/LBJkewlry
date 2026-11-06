-- LB jewelry — peso da peça (só no painel) e data de nascimento do cliente.
-- Copia o que já tiver sido salvo no settings.ops_extras enquanto as colunas não existiam.
-- Pode rodar mais de uma vez sem problema.

begin;

alter table products add column if not exists weight numeric not null default 0;
alter table clients add column if not exists birth_date text default '';

update products p set
  weight = coalesce((e.value -> 'products' -> p.id ->> 'weight')::numeric, p.weight)
from settings e
where e.key = 'ops_extras' and e.value -> 'products' -> p.id ? 'weight';

update clients c set
  birth_date = coalesce(e.value -> 'clients' -> c.id ->> 'birthDate', c.birth_date)
from settings e
where e.key = 'ops_extras' and e.value -> 'clients' -> c.id ? 'birthDate';

commit;

select 'peças com peso' as item, count(*) from products where weight > 0
union all select 'clientes com aniversário', count(*) from clients where birth_date <> '';
