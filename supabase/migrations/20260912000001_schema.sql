-- =====================================================================
-- Buteco Seu Barba — sistema de comandas
-- Schema Postgres / Supabase
--
-- Princípios:
--   1. Lançamento é imutável. Cancelar é um evento, nunca UPDATE/DELETE.
--   2. Preço é congelado no momento do lançamento.
--   3. Escrita só acontece via function (security definer).
--      O cliente NÃO tem insert/update/delete direto nas tabelas de operação.
--   4. Toda autorização de cancelamento fica registrada com quem autorizou.
-- =====================================================================

-- No Supabase as extensões ficam no schema `extensions`, não no `public`.
-- Já vem instalada nos projetos novos; o if-not-exists só garante.
create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- 1. PESSOAS E PAPÉIS
-- =====================================================================

create type papel as enum ('dono', 'gerente', 'garcom');

create table perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  papel       papel not null default 'garcom',
  -- PIN só para quem autoriza cancelamento (dono/gerente). bcrypt via pgcrypto.
  pin_hash    text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

comment on column perfis.pin_hash is
  'PIN de autorização, digitado no aparelho do garçom. Nunca trafega em claro.';

-- cria o perfil junto com o usuário do auth
create or replace function handle_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfis (id, nome, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'papel')::papel, 'garcom')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_novo_usuario();

-- helpers usados nas policies
create or replace function papel_atual()
returns papel
language sql
stable
security definer
set search_path = public
as $$
  select papel from perfis where id = auth.uid() and ativo;
$$;

create or replace function e_gestor()
returns boolean
language sql
stable
as $$
  select papel_atual() in ('dono', 'gerente');
$$;

-- valida PIN e devolve o id de quem autorizou
create or replace function validar_pin(p_pin text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select id
  from perfis
  where ativo
    and papel in ('dono', 'gerente')
    and pin_hash is not null
    and pin_hash = crypt(p_pin, pin_hash)
  limit 1;
$$;

create or replace function definir_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not e_gestor() then
    raise exception 'Apenas dono ou gerente tem PIN de autorização';
  end if;
  if length(p_pin) < 4 then
    raise exception 'PIN precisa de pelo menos 4 dígitos';
  end if;
  update perfis set pin_hash = crypt(p_pin, gen_salt('bf')) where id = auth.uid();
end;
$$;

-- =====================================================================
-- 2. CARDÁPIO
-- =====================================================================

create type destino_producao as enum ('chapa', 'cozinha', 'balcao');

create table categorias (
  id        bigint generated always as identity primary key,
  nome      text not null,
  destino   destino_producao not null default 'balcao',
  ordem     int  not null default 0,
  ativa     boolean not null default true
);

create table produtos (
  id           bigint generated always as identity primary key,
  categoria_id bigint not null references categorias(id),
  nome         text not null,
  observacao   text,
  preco        numeric(10,2) not null check (preco >= 0),
  -- "acabou o cupim": esconde do garçom sem apagar o histórico
  disponivel   boolean not null default true,
  ativo        boolean not null default true,
  ordem        int not null default 0,
  atualizado_em timestamptz not null default now()
);

create index on produtos (categoria_id) where ativo;

-- histórico de preço: relatório precisa saber quando mudou
create table produtos_historico_preco (
  id          bigint generated always as identity primary key,
  produto_id  bigint not null references produtos(id),
  preco_antigo numeric(10,2),
  preco_novo   numeric(10,2) not null,
  alterado_por uuid references perfis(id),
  alterado_em  timestamptz not null default now()
);

create or replace function registrar_mudanca_preco()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.preco is distinct from old.preco then
    insert into produtos_historico_preco (produto_id, preco_antigo, preco_novo, alterado_por)
    values (new.id, old.preco, new.preco, auth.uid());
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

create trigger trg_preco before update on produtos
  for each row execute function registrar_mudanca_preco();

create table mesas (
  id      bigint generated always as identity primary key,
  rotulo  text not null unique,     -- '1', '2', 'Balcão'
  ordem   int not null default 0,
  ativa   boolean not null default true
);

-- =====================================================================
-- 3. CAIXA (TURNO)
-- =====================================================================
-- A unidade de fechamento é o turno, não o dia do calendário.
-- Sábado que vira madrugada continua na mesma sessão.

create table sessoes_caixa (
  id               bigint generated always as identity primary key,
  aberta_em        timestamptz not null default now(),
  aberta_por       uuid not null references perfis(id),
  troco_inicial    numeric(10,2) not null default 0,
  -- dia de evento: cobra couvert
  evento           boolean not null default false,
  couvert_valor    numeric(10,2) not null default 0,
  fechada_em       timestamptz,
  fechada_por      uuid references perfis(id),
  valor_conferido  numeric(10,2),  -- o que realmente tinha na gaveta
  observacao       text
);

-- só uma sessão aberta por vez
create unique index uniq_sessao_aberta
  on sessoes_caixa ((fechada_em is null)) where fechada_em is null;

create type tipo_movimento as enum ('sangria', 'suprimento');

create table movimentos_caixa (
  id         bigint generated always as identity primary key,
  sessao_id  bigint not null references sessoes_caixa(id),
  tipo       tipo_movimento not null,
  valor      numeric(10,2) not null check (valor > 0),
  motivo     text,
  criado_por uuid not null references perfis(id),
  criado_em  timestamptz not null default now()
);

-- =====================================================================
-- 4. COMANDAS
-- =====================================================================

create type status_comanda as enum ('aberta', 'fechada');

create table comandas (
  id           bigint generated always as identity primary key,
  mesa_id      bigint not null references mesas(id),
  sessao_id    bigint not null references sessoes_caixa(id),
  status       status_comanda not null default 'aberta',
  pessoas      int not null default 1 check (pessoas > 0),
  couvert_por_pessoa numeric(10,2) not null default 0,  -- congelado na abertura
  aberta_em    timestamptz not null default now(),
  aberta_por   uuid not null references perfis(id),
  fechada_em   timestamptz,
  fechada_por  uuid references perfis(id),
  observacao   text
);

-- uma comanda aberta por mesa
create unique index uniq_comanda_aberta_por_mesa
  on comandas (mesa_id) where status = 'aberta';

create index on comandas (sessao_id);

-- =====================================================================
-- 5. LANÇAMENTOS — o coração do sistema
-- =====================================================================
-- id vem do CLIENTE (uuid gerado no app) para idempotência:
-- garçom toca duas vezes por causa do wi-fi, entra um só.

create type status_producao as enum ('pendente', 'entregue');

create table lancamentos (
  id              uuid primary key,
  comanda_id      bigint not null references comandas(id),
  produto_id      bigint not null references produtos(id),

  -- snapshot: cardápio pode mudar, a comanda aberta não muda de valor
  nome_produto    text not null,
  preco_unitario  numeric(10,2) not null check (preco_unitario >= 0),
  destino         destino_producao not null,

  quantidade      int not null default 1 check (quantidade > 0),
  observacao      text,

  criado_por      uuid not null references perfis(id),
  criado_em       timestamptz not null default now(),

  producao        status_producao not null default 'pendente',
  entregue_em     timestamptz,

  -- cancelamento é estado, não ausência de linha
  cancelado_em    timestamptz,
  cancelado_por   uuid references perfis(id),
  autorizado_por  uuid references perfis(id),
  motivo_cancelamento text,

  constraint cancelamento_completo check (
    (cancelado_em is null and cancelado_por is null and autorizado_por is null)
    or
    (cancelado_em is not null and cancelado_por is not null and autorizado_por is not null)
  )
);

create index on lancamentos (comanda_id) where cancelado_em is null;
create index on lancamentos (destino, producao) where cancelado_em is null and producao = 'pendente';
create index on lancamentos (criado_em desc);

-- transferência entre comandas também é evento, nunca troca silenciosa de FK
create table transferencias (
  id                 bigint generated always as identity primary key,
  lancamento_id      uuid not null references lancamentos(id),
  comanda_origem     bigint not null references comandas(id),
  comanda_destino    bigint not null references comandas(id),
  criado_por         uuid not null references perfis(id),
  criado_em          timestamptz not null default now()
);

-- =====================================================================
-- 6. PAGAMENTOS
-- =====================================================================
-- Pagamento parcial existe: quem sai antes paga a parte dele
-- e a mesa continua aberta.

create type forma_pagamento as enum ('pix', 'debito', 'credito', 'dinheiro');

create table pagamentos (
  id          bigint generated always as identity primary key,
  comanda_id  bigint not null references comandas(id),
  forma       forma_pagamento not null,
  valor       numeric(10,2) not null check (valor > 0),
  criado_por  uuid not null references perfis(id),
  criado_em   timestamptz not null default now()
);

create index on pagamentos (comanda_id);

-- =====================================================================
-- 7. TOTAIS E VISÕES
-- =====================================================================

create or replace function total_comanda(p_comanda bigint)
returns numeric
language sql
stable
as $$
  select
    coalesce((
      select sum(l.preco_unitario * l.quantidade)
      from lancamentos l
      where l.comanda_id = p_comanda and l.cancelado_em is null
    ), 0)
    +
    coalesce((
      select c.pessoas * c.couvert_por_pessoa from comandas c where c.id = p_comanda
    ), 0);
$$;

create or replace function pago_comanda(p_comanda bigint)
returns numeric
language sql
stable
as $$
  select coalesce(sum(valor), 0) from pagamentos where comanda_id = p_comanda;
$$;

-- salão: o que a tela do garçom e do dono leem
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
    where l.comanda_id = c.id and l.cancelado_em is null) as itens
from mesas m
left join comandas c on c.mesa_id = m.id and c.status = 'aberta'
left join perfis p   on p.id = c.aberta_por
where m.ativa
order by m.ordem;

-- fila de produção (chapa / cozinha)
create or replace view v_producao with (security_invoker = true) as
select
  l.id, l.nome_produto, l.quantidade, l.observacao, l.destino,
  l.criado_em, m.rotulo as mesa, pf.nome as garcom
from lancamentos l
join comandas c on c.id = l.comanda_id
join mesas m    on m.id = c.mesa_id
join perfis pf  on pf.id = l.criado_por
where l.cancelado_em is null
  and l.producao = 'pendente'
  and l.destino <> 'balcao'
order by l.criado_em;

-- fechamento do turno, por forma de pagamento
create or replace view v_fechamento_sessao with (security_invoker = true) as
select
  s.id as sessao_id,
  s.aberta_em, s.fechada_em, s.troco_inicial,
  coalesce(sum(pg.valor) filter (where pg.forma = 'dinheiro'), 0) as dinheiro,
  coalesce(sum(pg.valor) filter (where pg.forma = 'pix'), 0)      as pix,
  coalesce(sum(pg.valor) filter (where pg.forma = 'debito'), 0)   as debito,
  coalesce(sum(pg.valor) filter (where pg.forma = 'credito'), 0)  as credito,
  coalesce(sum(pg.valor), 0)                                      as total_recebido,
  coalesce((select sum(valor) from movimentos_caixa mc
             where mc.sessao_id = s.id and mc.tipo = 'sangria'), 0)    as sangrias,
  coalesce((select sum(valor) from movimentos_caixa mc
             where mc.sessao_id = s.id and mc.tipo = 'suprimento'), 0) as suprimentos
from sessoes_caixa s
left join comandas c  on c.sessao_id = s.id
left join pagamentos pg on pg.comanda_id = c.id
group by s.id;

-- ranking de produtos do turno: o relatório que o dono abre
create or replace view v_vendas_produto with (security_invoker = true) as
select
  c.sessao_id,
  l.produto_id,
  l.nome_produto,
  sum(l.quantidade)                        as vendidos,
  sum(l.quantidade * l.preco_unitario)     as faturado,
  count(*) filter (where l.cancelado_em is not null) as cancelamentos
from lancamentos l
join comandas c on c.id = l.comanda_id
group by c.sessao_id, l.produto_id, l.nome_produto;

-- =====================================================================
-- 8. OPERAÇÕES (o cliente só escreve por aqui)
-- =====================================================================

create or replace function sessao_aberta()
returns bigint
language sql
stable
as $$
  select id from sessoes_caixa where fechada_em is null limit 1;
$$;

create or replace function abrir_sessao_caixa(
  p_troco numeric default 0,
  p_evento boolean default false,
  p_couvert numeric default 0
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if not e_gestor() then
    raise exception 'Apenas dono ou gerente abre o caixa';
  end if;
  if sessao_aberta() is not null then
    raise exception 'Já existe um turno aberto';
  end if;

  insert into sessoes_caixa (aberta_por, troco_inicial, evento, couvert_valor)
  values (auth.uid(), p_troco, p_evento, case when p_evento then p_couvert else 0 end)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function fechar_sessao_caixa(
  p_valor_conferido numeric,
  p_observacao text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_sessao bigint := sessao_aberta();
begin
  if not e_gestor() then
    raise exception 'Apenas dono ou gerente fecha o caixa';
  end if;
  if v_sessao is null then
    raise exception 'Nenhum turno aberto';
  end if;
  if exists (select 1 from comandas where sessao_id = v_sessao and status = 'aberta') then
    raise exception 'Ainda há comandas abertas no salão';
  end if;

  update sessoes_caixa
     set fechada_em = now(), fechada_por = auth.uid(),
         valor_conferido = p_valor_conferido, observacao = p_observacao
   where id = v_sessao;
end;
$$;

create or replace function abrir_comanda(p_mesa bigint, p_pessoas int default 1)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao bigint := sessao_aberta();
  v_couvert numeric := 0;
  v_id bigint;
begin
  if v_sessao is null then
    raise exception 'Caixa fechado: abra o turno antes de lançar';
  end if;

  select case when evento then couvert_valor else 0 end
    into v_couvert from sessoes_caixa where id = v_sessao;

  insert into comandas (mesa_id, sessao_id, pessoas, couvert_por_pessoa, aberta_por)
  values (p_mesa, v_sessao, p_pessoas, v_couvert, auth.uid())
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    -- mesa já tinha comanda aberta: devolve a existente em vez de estourar
    select id into v_id from comandas where mesa_id = p_mesa and status = 'aberta';
    return v_id;
end;
$$;

-- LANÇAR: idempotente pelo uuid do cliente, congela nome/preço/destino
create or replace function lancar_item(
  p_id uuid,
  p_comanda bigint,
  p_produto bigint,
  p_quantidade int default 1,
  p_observacao text default null
) returns lancamentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod record;
  v_row  lancamentos;
begin
  -- reenvio do mesmo lançamento: devolve o que já existe, não duplica
  select * into v_row from lancamentos where id = p_id;
  if found then return v_row; end if;

  if not exists (select 1 from comandas where id = p_comanda and status = 'aberta') then
    raise exception 'Comanda não está aberta';
  end if;

  select p.nome, p.preco, p.disponivel, p.ativo, c.destino
    into v_prod
    from produtos p join categorias c on c.id = p.categoria_id
   where p.id = p_produto;

  if not found or not v_prod.ativo then
    raise exception 'Produto inexistente';
  end if;
  if not v_prod.disponivel then
    raise exception 'Produto indisponível: %', v_prod.nome;
  end if;

  insert into lancamentos (
    id, comanda_id, produto_id, nome_produto, preco_unitario,
    destino, quantidade, observacao, criado_por
  ) values (
    p_id, p_comanda, p_produto, v_prod.nome, v_prod.preco,
    v_prod.destino, p_quantidade, p_observacao, auth.uid()
  ) returning * into v_row;

  return v_row;
end;
$$;

-- CANCELAR: exige PIN de dono/gerente e registra quem autorizou
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

create or replace function marcar_entregue(p_lancamento uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update lancamentos
     set producao = 'entregue', entregue_em = now()
   where id = p_lancamento and cancelado_em is null;
end;
$$;

-- TRANSFERIR / JUNTAR MESAS
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

create or replace function registrar_pagamento(
  p_comanda bigint,
  p_forma forma_pagamento,
  p_valor numeric
) returns numeric   -- devolve o que ainda falta
language plpgsql
security definer
set search_path = public
as $$
declare v_falta numeric;
begin
  if not exists (select 1 from comandas where id = p_comanda and status = 'aberta') then
    raise exception 'Comanda não está aberta';
  end if;

  insert into pagamentos (comanda_id, forma, valor, criado_por)
  values (p_comanda, p_forma, p_valor, auth.uid());

  select total_comanda(p_comanda) - pago_comanda(p_comanda) into v_falta;
  return greatest(v_falta, 0);
end;
$$;

create or replace function fechar_comanda(p_comanda bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_falta numeric;
begin
  select total_comanda(p_comanda) - pago_comanda(p_comanda) into v_falta;

  if v_falta > 0.009 then
    raise exception 'Faltam R$ % para fechar a comanda', to_char(v_falta, 'FM999990.00');
  end if;

  update comandas
     set status = 'fechada', fechada_em = now(), fechada_por = auth.uid()
   where id = p_comanda and status = 'aberta';

  if not found then
    raise exception 'Comanda já estava fechada';
  end if;
end;
$$;

create or replace function alternar_disponibilidade(p_produto bigint, p_disponivel boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not e_gestor() then
    raise exception 'Apenas dono ou gerente muda a disponibilidade';
  end if;
  update produtos set disponivel = p_disponivel where id = p_produto;
end;
$$;

create or replace function registrar_movimento_caixa(
  p_tipo tipo_movimento, p_valor numeric, p_motivo text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_sessao bigint := sessao_aberta();
begin
  if not e_gestor() then
    raise exception 'Apenas dono ou gerente faz sangria ou suprimento';
  end if;
  if v_sessao is null then
    raise exception 'Nenhum turno aberto';
  end if;

  insert into movimentos_caixa (sessao_id, tipo, valor, motivo, criado_por)
  values (v_sessao, p_tipo, p_valor, p_motivo, auth.uid());
end;
$$;

-- =====================================================================
-- 9. RLS
-- =====================================================================
-- Leitura por policy. Escrita de operação: NENHUMA policy —
-- as functions acima (security definer) são o único caminho.

alter table perfis                    enable row level security;
alter table categorias                enable row level security;
alter table produtos                  enable row level security;
alter table produtos_historico_preco  enable row level security;
alter table mesas                     enable row level security;
alter table sessoes_caixa             enable row level security;
alter table movimentos_caixa          enable row level security;
alter table comandas                  enable row level security;
alter table lancamentos               enable row level security;
alter table transferencias            enable row level security;
alter table pagamentos                enable row level security;

-- perfis
create policy perfis_le_proprio on perfis for select
  using (id = auth.uid() or e_gestor());
create policy perfis_gestor_escreve on perfis for update
  using (e_gestor()) with check (e_gestor());
create policy perfis_gestor_insere on perfis for insert
  with check (e_gestor());

-- cardápio: todo mundo lê, gestor edita direto (não precisa de function)
create policy cardapio_le on categorias for select using (auth.uid() is not null);
create policy cardapio_escreve on categorias for all
  using (e_gestor()) with check (e_gestor());

create policy produtos_le on produtos for select using (auth.uid() is not null);
create policy produtos_escreve on produtos for all
  using (e_gestor()) with check (e_gestor());

create policy historico_le on produtos_historico_preco for select using (e_gestor());

create policy mesas_le on mesas for select using (auth.uid() is not null);
create policy mesas_escreve on mesas for all
  using (e_gestor()) with check (e_gestor());

-- caixa: garçom vê que o turno está aberto, só gestor vê os valores
create policy sessao_le on sessoes_caixa for select using (auth.uid() is not null);
create policy movimentos_le on movimentos_caixa for select using (e_gestor());

-- operação: leitura para toda a equipe (o salão é compartilhado)
create policy comandas_le    on comandas    for select using (auth.uid() is not null);
create policy lancamentos_le on lancamentos for select using (auth.uid() is not null);
create policy transf_le      on transferencias for select using (auth.uid() is not null);
create policy pagamentos_le  on pagamentos  for select using (auth.uid() is not null);

-- trava explícita: nada de escrita direta nas tabelas de operação
revoke insert, update, delete on comandas, lancamentos, pagamentos,
  transferencias, sessoes_caixa, movimentos_caixa from authenticated;

-- =====================================================================
-- 10. REALTIME
-- =====================================================================
-- Garçom vê a mesa do colega e o dono vê o salão ao vivo.

alter publication supabase_realtime add table lancamentos;
alter publication supabase_realtime add table comandas;
alter publication supabase_realtime add table produtos;
alter publication supabase_realtime add table pagamentos;
