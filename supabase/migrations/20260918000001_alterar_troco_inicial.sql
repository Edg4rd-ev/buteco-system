-- =====================================================================
-- Alterar troco inicial do turno já aberto
--
-- Só o dono autoriza (não gerente) — troco errado no fechamento é
-- problema do dono, então só o PIN dele destrava o ajuste. Fica
-- registrado quem pediu e quem autorizou, igual ao cancelamento de item.
-- =====================================================================

create table troco_ajustes (
  id             bigint generated always as identity primary key,
  sessao_id      bigint not null references sessoes_caixa(id),
  valor_antigo   numeric(10,2) not null,
  valor_novo     numeric(10,2) not null,
  solicitado_por uuid not null references perfis(id),
  autorizado_por uuid not null references perfis(id),
  criado_em      timestamptz not null default now()
);

create or replace function alterar_troco_inicial(p_valor numeric, p_pin text)
returns sessoes_caixa
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sessao bigint := sessao_aberta();
  v_autorizador uuid;
  v_papel_autorizador papel;
  v_row sessoes_caixa;
begin
  if v_sessao is null then
    raise exception 'Nenhum turno aberto';
  end if;
  if p_valor < 0 then
    raise exception 'Troco inválido';
  end if;

  v_autorizador := validar_pin(p_pin);
  if v_autorizador is null then
    raise exception 'PIN inválido';
  end if;

  select papel into v_papel_autorizador from perfis where id = v_autorizador;
  if v_papel_autorizador <> 'dono' then
    raise exception 'Apenas o dono autoriza a alteração do troco inicial';
  end if;

  insert into troco_ajustes (sessao_id, valor_antigo, valor_novo, solicitado_por, autorizado_por)
  select v_sessao, troco_inicial, p_valor, auth.uid(), v_autorizador
    from sessoes_caixa where id = v_sessao;

  update sessoes_caixa
     set troco_inicial = p_valor
   where id = v_sessao
  returning * into v_row;

  return v_row;
end;
$$;

alter table troco_ajustes enable row level security;
create policy troco_ajustes_le on troco_ajustes for select using (e_gestor());

grant select on troco_ajustes to authenticated;
revoke insert, update, delete on troco_ajustes from authenticated;
