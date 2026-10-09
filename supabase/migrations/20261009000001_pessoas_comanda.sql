-- =====================================================================
-- Pessoas na comanda (couvert por pessoa)
--
-- Em dia de evento o couvert é por cabeça: comandas.couvert_por_pessoa
-- já congela o valor na abertura e total_comanda já multiplica por
-- comandas.pessoas — só faltava o garçom poder mudar quantas pessoas
-- tem na mesa conforme o pessoal vai chegando (ou indo embora).
-- =====================================================================

create or replace function alterar_pessoas_comanda(p_comanda bigint, p_pessoas int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pessoas is null or p_pessoas < 1 then
    raise exception 'A mesa precisa ter pelo menos 1 pessoa';
  end if;
  update comandas
     set pessoas = p_pessoas
   where id = p_comanda and status = 'aberta';
  if not found then
    raise exception 'Comanda não está aberta';
  end if;
end;
$$;

-- Cancelar a abertura de uma mesa que não consumiu nada. Antes isso era
-- feito com fechar_comanda, mas com couvert o total de uma mesa vazia
-- não é zero — e fechar_comanda recusaria por "faltar" o couvert de
-- gente que nem ficou. Só vale se não há item lançado nem pagamento.
create or replace function cancelar_abertura_comanda(p_comanda bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from lancamentos where comanda_id = p_comanda and cancelado_em is null) then
    raise exception 'A mesa já tem itens lançados';
  end if;
  if exists (select 1 from pagamentos where comanda_id = p_comanda) then
    raise exception 'A mesa já tem pagamento registrado';
  end if;
  update comandas
     set status = 'fechada', fechada_em = now(), fechada_por = auth.uid()
   where id = p_comanda and status = 'aberta';
  if not found then
    raise exception 'Comanda já estava fechada';
  end if;
end;
$$;

-- function nova nasce executável por PUBLIC (inclui anon) — a trava do
-- anon em ajustes_hospedado só valeu pras que já existiam. renomear_comanda
-- entrou depois e ficou com a mesma brecha; fecha junto.
revoke execute on function alterar_pessoas_comanda(bigint, int) from public, anon;
revoke execute on function cancelar_abertura_comanda(bigint) from public, anon;
revoke execute on function renomear_comanda(bigint, text) from public, anon;
grant execute on function alterar_pessoas_comanda(bigint, int) to authenticated;
grant execute on function cancelar_abertura_comanda(bigint) to authenticated;
grant execute on function renomear_comanda(bigint, text) to authenticated;
