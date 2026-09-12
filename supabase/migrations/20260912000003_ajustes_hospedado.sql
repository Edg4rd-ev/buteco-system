-- =====================================================================
-- Ajustes para projeto hospedado no Supabase
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REPLICA IDENTITY
-- ---------------------------------------------------------------------
-- O app assina mudanças com filtro (comanda_id=eq.X). Para UPDATE e DELETE,
-- o Realtime só consegue avaliar o filtro se a linha antiga trouxer as
-- colunas — com a identidade padrão ela traz só a PK.
-- Cancelamento é UPDATE, então sem isso o evento não chega filtrado.

alter table lancamentos replica identity full;
alter table comandas    replica identity full;
alter table pagamentos  replica identity full;

-- ---------------------------------------------------------------------
-- 2. GRANTS EXPLÍCITOS
-- ---------------------------------------------------------------------
-- O Supabase concede isso por default privileges, mas depender disso
-- quebra quando o schema é aplicado por outro papel. RLS continua valendo:
-- grant abre a porta, policy decide quem passa.

grant usage on schema public to anon, authenticated;

grant select on
  perfis, categorias, produtos, produtos_historico_preco, mesas,
  sessoes_caixa, movimentos_caixa, comandas, lancamentos,
  transferencias, pagamentos
to authenticated;

grant select on
  v_salao, v_producao, v_fechamento_sessao, v_vendas_produto
to authenticated;

-- as functions security definer são o único caminho de escrita
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------
-- 3. TRAVA DO ANON
-- ---------------------------------------------------------------------
-- Ninguém deslogado tem nada a fazer aqui.

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
