// Edge Function: gestão de usuários pelo dono.
//
// Criar usuário, redefinir senha de outra pessoa e bloquear login exigem a
// service role, que nunca pode ir pro navegador. Esta function recebe o
// pedido do app, confere se quem chamou é DONO ativo e só então age.
//
// Deploy:  npx supabase functions deploy gerir-usuarios --project-ref <ref>
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm no ambiente da function)

import { createClient } from "npm:@supabase/supabase-js@2";

// Mesmo domínio de src/lib/api.ts (DOMINIO_LOGIN). O garçom digita só
// "carlos"; o Auth do Supabase precisa de um e-mail, então vira este.
const DOMINIO_LOGIN = "buteco.local";
const PAPEIS = ["dono", "gerente", "garcom"] as const;
type Papel = (typeof PAPEIS)[number];
const SENHA_MINIMA = 6;
// ~100 anos: o Auth não tem "bloqueado pra sempre", só ban com duração
const BLOQUEIO = "876000h";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const falha = (erro: string, status = 400) => responder({ erro }, status);

const ePapel = (v: unknown): v is Papel => typeof v === "string" && (PAPEIS as readonly string[]).includes(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return falha("Método não permitido.", 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  /* ---------- quem está pedindo ---------- */

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return falha("Sessão expirada. Entre de novo.", 401);

  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem.user) return falha("Sessão expirada. Entre de novo.", 401);
  const eu = quem.user.id;

  const { data: meuPerfil } = await admin
    .from("perfis")
    .select("papel, ativo")
    .eq("id", eu)
    .maybeSingle();
  if (!meuPerfil || meuPerfil.papel !== "dono" || !meuPerfil.ativo) {
    return falha("Só o dono pode gerir a equipe.", 403);
  }

  /* ---------- o pedido ---------- */

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return falha("Pedido inválido.");
  }

  try {
    switch (corpo.acao) {
      case "criar": {
        const usuario = String(corpo.usuario ?? "").trim().toLowerCase();
        const nome = String(corpo.nome ?? "").trim();
        const senha = String(corpo.senha ?? "");
        const papel = corpo.papel;

        if (!nome) return falha("Informe o nome.");
        if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(usuario)) {
          return falha("Usuário: de 2 a 30 letras ou números, sem espaço nem acento.");
        }
        if (senha.length < SENHA_MINIMA) return falha(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
        if (!ePapel(papel)) return falha("Papel inválido.");

        const { data: criado, error } = await admin.auth.admin.createUser({
          email: `${usuario}@${DOMINIO_LOGIN}`,
          password: senha,
          email_confirm: true,
          user_metadata: { nome },
        });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) return falha("Já existe alguém com esse usuário.");
          throw error;
        }

        // o trigger criou o perfil como garçom; o papel só vem daqui
        if (papel !== "garcom") {
          const { error: erroPapel } = await admin.from("perfis").update({ papel }).eq("id", criado.user.id);
          if (erroPapel) throw erroPapel;
        }
        return responder({ id: criado.user.id });
      }

      case "redefinir_senha": {
        const id = String(corpo.id ?? "");
        const senha = String(corpo.senha ?? "");
        if (!id) return falha("Usuário não informado.");
        if (senha.length < SENHA_MINIMA) return falha(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);

        const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
        if (error) throw error;
        return responder({ ok: true });
      }

      case "atualizar": {
        const id = String(corpo.id ?? "");
        if (!id) return falha("Usuário não informado.");

        const mudancas: { nome?: string; papel?: Papel; ativo?: boolean } = {};
        if (corpo.nome !== undefined) {
          const nome = String(corpo.nome).trim();
          if (!nome) return falha("Informe o nome.");
          mudancas.nome = nome;
        }
        if (corpo.papel !== undefined) {
          if (!ePapel(corpo.papel)) return falha("Papel inválido.");
          mudancas.papel = corpo.papel;
        }
        if (corpo.ativo !== undefined) mudancas.ativo = corpo.ativo === true;

        if (id === eu && ((mudancas.papel && mudancas.papel !== "dono") || mudancas.ativo === false)) {
          return falha("Você não pode tirar o seu próprio acesso de dono.");
        }
        if (Object.keys(mudancas).length === 0) return responder({ ok: true });

        // perfil primeiro: se violar "pelo menos um dono ativo", o banco
        // recusa aqui e o login não chega a ser bloqueado
        const { error } = await admin.from("perfis").update(mudancas).eq("id", id);
        if (error) {
          if (/pelo menos um dono/i.test(error.message)) return falha("O bar precisa de pelo menos um dono ativo.");
          throw error;
        }

        // desativado não entra mais: sem isso a senha ainda logaria
        // (o RLS já barrava tudo, mas a pessoa via as telas vazias)
        if (mudancas.ativo !== undefined) {
          const { error: erroBan } = await admin.auth.admin.updateUserById(id, {
            ban_duration: mudancas.ativo ? "none" : BLOQUEIO,
          });
          if (erroBan) throw erroBan;
        }
        return responder({ ok: true });
      }

      default:
        return falha("Ação desconhecida.");
    }
  } catch (e) {
    console.error(e);
    return falha("Não foi possível concluir. Tente de novo.", 500);
  }
});
