-- =====================================================================
-- Pagamento parcial por item
--
-- Quem sai mais cedo pode pagar só o que consumiu: o garçom marca os
-- itens (e quantos couverts) e eles ficam como "pagos" na comanda — o
-- item NÃO sai da comanda, só ganha o vínculo com o pagamento. Pagar
-- valor solto ("metade e tchau") continua igual, por registrar_pagamento.
--
-- Tudo aditivo: registrar_pagamento não muda de assinatura, a coluna
-- nova tem default — o app que já está no ar continua funcionando.
-- =====================================================================

create table pagamento_itens (
  pagamento_id  bigint not null references pagamentos(id),
  lancamento_id uuid   not null references lancamentos(id),
  primary key (pagamento_id, lancamento_id),
  -- um item só é pago uma vez
  constraint pagamento_itens_lancamento_unico unique (lancamento_id)
);

-- quantos couverts aquele pagamento cobriu
alter table pagamentos
  add column couvert_pessoas int not null default 0 check (couvert_pessoas >= 0);

create or replace function couverts_pagos(p_comanda bigint)
returns int
language sql
stable
as $$
  select coalesce(sum(couvert_pessoas), 0)::int from pagamentos where comanda_id = p_comanda;
$$;

create or replace function registrar_pagamento_itens(
  p_comanda bigint,
  p_forma forma_pagamento,
  p_valor numeric,
  p_lancamentos uuid[] default '{}',
  p_couvert_pessoas int default 0
) returns numeric   -- devolve o que ainda falta
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pessoas int;
  v_pagamento bigint;
  v_validos int;
  v_falta numeric;
begin
  p_lancamentos := coalesce(p_lancamentos, '{}');
  p_couvert_pessoas := coalesce(p_couvert_pessoas, 0);

  -- trava a comanda: dois aparelhos pagando o mesmo item ao mesmo tempo
  -- esperam um ao outro, e o segundo cai na checagem de "já pago"
  select pessoas into v_pessoas
    from comandas
   where id = p_comanda and status = 'aberta'
     for update;
  if not found then
    raise exception 'Comanda não está aberta';
  end if;

  if p_couvert_pessoas < 0 then
    raise exception 'Quantidade de couvert inválida';
  end if;
  if p_couvert_pessoas > 0
     and couverts_pagos(p_comanda) + p_couvert_pessoas > v_pessoas then
    raise exception 'Não há tantos couverts em aberto nessa mesa';
  end if;

  select count(*) into v_validos
    from lancamentos l
   where l.id = any(p_lancamentos)
     and l.comanda_id = p_comanda
     and l.cancelado_em is null
     and not exists (select 1 from pagamento_itens pi where pi.lancamento_id = l.id);
  if v_validos <> cardinality(array(select distinct unnest(p_lancamentos))) then
    raise exception 'Algum item escolhido já foi pago, cancelado ou mudou de mesa — reabra a conta';
  end if;

  insert into pagamentos (comanda_id, forma, valor, criado_por, couvert_pessoas)
  values (p_comanda, p_forma, p_valor, auth.uid(), p_couvert_pessoas)
  returning id into v_pagamento;

  insert into pagamento_itens (pagamento_id, lancamento_id)
  select distinct v_pagamento, unnest(p_lancamentos);

  select total_comanda(p_comanda) - pago_comanda(p_comanda) into v_falta;
  return greatest(v_falta, 0);
end;
$$;

-- item pago não some da conta nem muda de mesa sem mais nem menos: só
-- ganha a trava. Assinaturas iguais, só a checagem nova no começo.
create or replace function cancelar_lancamento(
  p_lancamento uuid,
  p_motivo text,
  p_pin text
) returns lancamentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autorizador uuid;
  v_row lancamentos;
begin
  if exists (select 1 from pagamento_itens where lancamento_id = p_lancamento) then
    raise exception 'Item já foi pago — não dá pra cancelar';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  v_autorizador := validar_pin(p_pin);
  if v_autorizador is null then
    raise exception 'PIN inválido';
  end if;

  update lancamentos
     set cancelado_em = now(),
         cancelado_por = auth.uid(),
         autorizado_por = v_autorizador,
         motivo_cancelamento = p_motivo
   where id = p_lancamento
     and cancelado_em is null
  returning * into v_row;

  if not found then
    raise exception 'Lançamento inexistente ou já cancelado';
  end if;

  return v_row;
end;
$$;

create or replace function transferir_lancamentos(
  p_lancamentos uuid[],
  p_destino bigint
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_origem bigint; v_n int := 0;
begin
  if not exists (select 1 from comandas where id = p_destino and status = 'aberta') then
    raise exception 'Comanda de destino não está aberta';
  end if;
  if exists (select 1 from pagamento_itens where lancamento_id = any(p_lancamentos)) then
    raise exception 'Item já pago não pode mudar de mesa';
  end if;

  foreach v_id in array p_lancamentos loop
    select comanda_id into v_origem
      from lancamentos where id = v_id and cancelado_em is null;
    continue when v_origem is null or v_origem = p_destino;

    insert into transferencias (lancamento_id, comanda_origem, comanda_destino, criado_por)
    values (v_id, v_origem, p_destino, auth.uid());

    update lancamentos set comanda_id = p_destino where id = v_id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- tirar pessoa não pode deixar menos pessoas do que couverts já pagos
create or replace function alterar_pessoas_comanda(
  p_comanda bigint,
  p_pessoas int,
  p_motivo text default null,
  p_pin text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual int;
  v_autorizador uuid;
begin
  if p_pessoas is null or p_pessoas < 1 then
    raise exception 'A mesa precisa ter pelo menos 1 pessoa';
  end if;

  select pessoas into v_atual
    from comandas
   where id = p_comanda and status = 'aberta'
     for update;
  if not found then
    raise exception 'Comanda não está aberta';
  end if;

  if p_pessoas < couverts_pagos(p_comanda) then
    raise exception 'Já foram pagos % couverts nessa mesa', couverts_pagos(p_comanda);
  end if;

  if p_pessoas < v_atual then
    if coalesce(trim(p_motivo), '') = '' then
      raise exception 'Informe o motivo para tirar pessoa da mesa';
    end if;
    v_autorizador := validar_pin(p_pin);
    if v_autorizador is null then
      raise exception 'PIN inválido';
    end if;

    insert into pessoas_ajustes
      (comanda_id, pessoas_antes, pessoas_depois, motivo, solicitado_por, autorizado_por)
    values
      (p_comanda, v_atual, p_pessoas, trim(p_motivo), auth.uid(), v_autorizador);
  end if;

  update comandas set pessoas = p_pessoas where id = p_comanda;
end;
$$;

alter table pagamento_itens enable row level security;
create policy pagamento_itens_le on pagamento_itens for select using (auth.uid() is not null);
grant select on pagamento_itens to authenticated;
revoke all on pagamento_itens from anon;
revoke insert, update, delete on pagamento_itens from authenticated;

revoke execute on function registrar_pagamento_itens(bigint, forma_pagamento, numeric, uuid[], int) from public, anon;
revoke execute on function couverts_pagos(bigint) from public, anon;
grant execute on function registrar_pagamento_itens(bigint, forma_pagamento, numeric, uuid[], int) to authenticated;
grant execute on function couverts_pagos(bigint) to authenticated;
