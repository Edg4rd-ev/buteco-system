-- =====================================================================
-- Tirar pessoa da comanda exige PIN
--
-- Adicionar pessoa só aumenta a conta — o garçom faz direto. Tirar
-- pessoa diminui o couvert cobrado, então segue a mesma regra do
-- cancelamento de item: motivo + PIN do dono ou gerente, e fica
-- registrado quem pediu e quem autorizou.
-- =====================================================================

create table pessoas_ajustes (
  id             bigint generated always as identity primary key,
  comanda_id     bigint not null references comandas(id),
  pessoas_antes  int not null,
  pessoas_depois int not null,
  motivo         text not null,
  solicitado_por uuid not null references perfis(id),
  autorizado_por uuid not null references perfis(id),
  criado_em      timestamptz not null default now()
);

create index on pessoas_ajustes (comanda_id);

drop function alterar_pessoas_comanda(bigint, int);

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

  -- trava a linha: dois aparelhos mexendo ao mesmo tempo não se atropelam
  select pessoas into v_atual
    from comandas
   where id = p_comanda and status = 'aberta'
     for update;
  if not found then
    raise exception 'Comanda não está aberta';
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

revoke execute on function alterar_pessoas_comanda(bigint, int, text, text) from public, anon;
grant execute on function alterar_pessoas_comanda(bigint, int, text, text) to authenticated;

alter table pessoas_ajustes enable row level security;
create policy pessoas_ajustes_le on pessoas_ajustes for select using (e_gestor());

grant select on pessoas_ajustes to authenticated;
revoke all on pessoas_ajustes from anon;
revoke insert, update, delete on pessoas_ajustes from authenticated;
