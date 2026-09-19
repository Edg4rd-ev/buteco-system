-- =====================================================================
-- Apelido da comanda aberta
--
-- O garçom pode rotular a mesa aberta ("da Marcia", "aniversário") sem
-- mexer no rótulo físico da mesa (mesas.rotulo é fixo, compartilhado
-- entre todas as comandas que passarem por ali). O apelido é um campo
-- solto na comanda em si, some quando ela fecha.
-- =====================================================================

alter table comandas add column apelido text;

-- create or replace view exige que colunas já existentes fiquem na mesma
-- posição — apelido entra no fim da lista, nunca no meio.
create or replace view v_salao with (security_invoker = true) as
select
  m.id              as mesa_id,
  m.rotulo,
  m.ordem,
  c.id              as comanda_id,
  c.aberta_em,
  c.pessoas,
  p.nome            as garcom,
  coalesce(total_comanda(c.id), 0) as total,
  coalesce(pago_comanda(c.id), 0)  as pago,
  (select count(*) from lancamentos l
    where l.comanda_id = c.id and l.cancelado_em is null) as itens,
  c.apelido
from mesas m
left join comandas c on c.mesa_id = m.id and c.status = 'aberta'
left join perfis p   on p.id = c.aberta_por
where m.ativa
order by m.ordem;

create or replace function renomear_comanda(p_comanda bigint, p_apelido text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from comandas where id = p_comanda and status = 'aberta') then
    raise exception 'Comanda não está aberta';
  end if;
  update comandas
     set apelido = nullif(trim(p_apelido), '')
   where id = p_comanda;
end;
$$;
