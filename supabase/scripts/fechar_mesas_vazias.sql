-- =====================================================================
-- Fechar mesas abertas sem nenhum item lançado
--
-- Sobra de mesa "presa": abrir_comanda criou a linha, mas nenhum item
-- chegou a ser confirmado (ex.: primeiro toque falhou por produto
-- indisponível, ou era o bug de abertura no toque, corrigido em
-- 20260919). A tela de Comanda já resolve isso sozinha agora
-- ("Cancelar abertura" aparece quando detecta o caso) — este script é
-- só pra quando você quiser fazer isso direto no banco, em lote.
--
-- Roda no SQL Editor do projeto hospedado:
-- https://supabase.com/dashboard/project/yantmuiceydworpwxzrh/sql/new
--
-- Não é um DELETE nem um UPDATE cru — chama a mesma function que o
-- app usa (fechar_comanda), então passa pelas mesmas travas: só fecha
-- se o total for zero (ou já estiver todo pago). Se alguma mesa da
-- lista tiver saldo em aberto, a function recusa e nada acontece com
-- ela — as outras da lista fecham normal.
-- =====================================================================

-- 1. Conferir quais mesas estão assim antes de fechar qualquer uma
select
  c.id as comanda_id,
  m.rotulo as mesa,
  c.aberta_em,
  c.apelido,
  (select count(*) from lancamentos l
     where l.comanda_id = c.id and l.cancelado_em is null) as itens,
  total_comanda(c.id) as total,
  pago_comanda(c.id) as pago
from comandas c
join mesas m on m.id = c.mesa_id
where c.status = 'aberta'
order by c.aberta_em;

-- 2. Fechar — troque os ids pelos que apareceram acima com itens = 0.
--    Rode uma linha por comanda (ou várias de uma vez, uma por select).
-- select fechar_comanda(43);
-- select fechar_comanda(45);

-- 3. Conferir que fechou
-- select id, status, fechada_por, fechada_em from comandas where id in (43, 45);

-- Nota: rodando aqui pelo SQL Editor (não pelo app), a sessão não tem
-- usuário logado, então fechada_por fica NULL em vez do id de quem
-- fechou — é só isso que muda; total/pago/status funcionam igual.
