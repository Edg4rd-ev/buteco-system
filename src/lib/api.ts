import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* ---------------- tipos ---------------- */

export type Papel = "dono" | "gerente" | "garcom";
export type Destino = "chapa" | "cozinha" | "balcao";
export type FormaPagamento = "pix" | "debito" | "credito" | "dinheiro";

export type Perfil = {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
};

export type Categoria = {
  id: number;
  nome: string;
  destino: Destino;
  ordem: number;
  ativa: boolean;
};

export type Produto = {
  id: number;
  categoria_id: number;
  nome: string;
  observacao: string | null;
  preco: number;
  disponivel: boolean;
  ativo: boolean;
  ordem: number;
};

export type MesaSalao = {
  mesa_id: number;
  rotulo: string;
  ordem: number;
  comanda_id: number | null;
  aberta_em: string | null;
  pessoas: number | null;
  garcom: string | null;
  total: number;
  pago: number;
  itens: number;
};

export type Lancamento = {
  id: string;
  comanda_id: number;
  produto_id: number;
  nome_produto: string;
  preco_unitario: number;
  quantidade: number;
  destino: Destino;
  observacao: string | null;
  criado_por: string;
  criado_em: string;
  cancelado_em: string | null;
};

/* ---------------- leitura ---------------- */

export async function buscarPerfil(): Promise<Perfil | null> {
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao.user) return null;
  const { data, error } = await supabase
    .from("perfis")
    .select("id, nome, papel, ativo")
    .eq("id", sessao.user.id)
    .single();
  if (error) throw error;
  return data as Perfil;
}

export async function buscarSalao(): Promise<MesaSalao[]> {
  const { data, error } = await supabase.from("v_salao").select("*");
  if (error) throw error;
  return (data ?? []) as MesaSalao[];
}

export async function buscarCardapio() {
  const [cat, prod] = await Promise.all([
    supabase.from("categorias").select("*").eq("ativa", true).order("ordem"),
    supabase.from("produtos").select("*").eq("ativo", true).order("ordem"),
  ]);
  if (cat.error) throw cat.error;
  if (prod.error) throw prod.error;
  return {
    categorias: (cat.data ?? []) as Categoria[],
    produtos: (prod.data ?? []) as Produto[],
  };
}

export async function buscarLancamentos(comandaId: number): Promise<Lancamento[]> {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("*")
    .eq("comanda_id", comandaId)
    .is("cancelado_em", null)
    .order("criado_em");
  if (error) throw error;
  return (data ?? []) as Lancamento[];
}

export async function sessaoCaixaAberta(): Promise<boolean> {
  const { data, error } = await supabase.rpc("sessao_aberta");
  if (error) throw error;
  return data !== null;
}

/* ---------------- escrita (só por RPC) ---------------- */

export async function abrirComanda(mesaId: number, pessoas = 1): Promise<number> {
  const { data, error } = await supabase.rpc("abrir_comanda", {
    p_mesa: mesaId,
    p_pessoas: pessoas,
  });
  if (error) throw error;
  return data as number;
}

export async function lancarItem(args: {
  id: string;
  comandaId: number;
  produtoId: number;
  quantidade?: number;
  observacao?: string | null;
}) {
  const { error } = await supabase.rpc("lancar_item", {
    p_id: args.id,
    p_comanda: args.comandaId,
    p_produto: args.produtoId,
    p_quantidade: args.quantidade ?? 1,
    p_observacao: args.observacao ?? null,
  });
  if (error) throw error;
}

export async function cancelarLancamento(id: string, motivo: string, pin: string) {
  const { error } = await supabase.rpc("cancelar_lancamento", {
    p_lancamento: id,
    p_motivo: motivo,
    p_pin: pin,
  });
  if (error) throw error;
}

export async function registrarPagamento(
  comandaId: number,
  forma: FormaPagamento,
  valor: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("registrar_pagamento", {
    p_comanda: comandaId,
    p_forma: forma,
    p_valor: valor,
  });
  if (error) throw error;
  return Number(data);
}

export async function fecharComanda(comandaId: number) {
  const { error } = await supabase.rpc("fechar_comanda", { p_comanda: comandaId });
  if (error) throw error;
}

/* ---------------- formato ---------------- */

export const dinheiro = (v: number) =>
  "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");

export const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function tempoDesde(iso: string | null) {
  if (!iso) return "";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "aberta agora";
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}
