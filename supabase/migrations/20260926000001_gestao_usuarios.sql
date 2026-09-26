-- =====================================================================
-- Gestão de usuários pelo dono
-- =====================================================================
-- Criar usuário e redefinir senha de outra pessoa precisam da service
-- role, então moram na Edge Function `gerir-usuarios` (supabase/functions).
-- Esta migration prepara o banco pra isso e fecha duas brechas que a
-- tela nova deixaria mais expostas:
--
--   1. perfis_gestor_escreve deixava o GERENTE alterar qualquer perfil —
--      inclusive se promover a dono — e o select liberava pin_hash.
--   2. handle_novo_usuario confiava no `papel` do user_metadata: com
--      cadastro público ligado, qualquer um se cadastrava como dono.
--
-- Depois dela, perfis só muda por function (definir_pin) ou pela Edge
-- Function (service role). O app só lê.

-- ---------------------------------------------------------------------
-- 1. LOGIN VISÍVEL NA EQUIPE
-- ---------------------------------------------------------------------
-- O dono precisa ver com que usuário cada um entra ("carlos"), e o
-- e-mail mora em auth.users, que o app não lê.

alter table perfis add column if not exists email text;

update perfis p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

-- ---------------------------------------------------------------------
-- 2. CADASTRO: TODO MUNDO NASCE GARÇOM
-- ---------------------------------------------------------------------
-- O papel é definido depois, pela Edge Function, que confere se quem
-- pediu é dono. O metadata só serve pro nome.

create or replace function handle_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfis (id, nome, papel, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nome'), ''), split_part(new.email, '@', 1)),
    'garcom',
    new.email
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. PERFIS: APP SÓ LÊ, E NÃO LÊ O PIN
-- ---------------------------------------------------------------------

drop policy if exists perfis_gestor_escreve on perfis;
drop policy if exists perfis_gestor_insere on perfis;

revoke insert, update, delete on perfis from authenticated;

-- pin_hash fica de fora: validar_pin e definir_pin são security definer
-- e continuam enxergando a coluna
revoke select on perfis from authenticated;
grant select (id, nome, papel, ativo, criado_em, email) on perfis to authenticated;

-- ---------------------------------------------------------------------
-- 4. NUNCA FICAR SEM DONO
-- ---------------------------------------------------------------------
-- A Edge Function já impede o dono de mexer no próprio papel/acesso,
-- mas a regra é do negócio, não da tela: fica no banco.

create or replace function garantir_um_dono()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from perfis where papel = 'dono' and ativo) then
    raise exception 'O bar precisa de pelo menos um dono ativo';
  end if;
  return null;
end;
$$;

drop trigger if exists perfis_garante_dono on perfis;
create trigger perfis_garante_dono
  after update of papel, ativo on perfis
  for each statement execute function garantir_um_dono();
