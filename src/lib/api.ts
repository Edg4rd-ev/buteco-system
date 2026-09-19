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
  apelido: string | null;
  aberta_em: string | null;
  pessoas: number | null;
  garcom: string | null;
  total: number;
  pago: number;
  itens: number;
};

export type ComandaInfo = {
  id: number;
  mesa_id: number;
  status: "aberta" | "fechada";
  apelido: string | null;
  aberta_em: string;
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
  cancelado_por: string | null;
  autorizado_por: string | null;
  motivo_cancelamento: string | null;
};

export type TipoMovimento = "sangria" | "suprimento";

export type SessaoCaixa = {
  id: number;
  aberta_em: string;
  aberta_por: string;
  troco_inicial: number;
  evento: boolean;
  couvert_valor: number;
  fechada_em: string | null;
  fechada_por: string | null;
  valor_conferido: number | null;
  observacao: string | null;
};

export type FechamentoSessao = {
  sessao_id: number;
  aberta_em: string;
  fechada_em: string | null;
  troco_inicial: number;
  dinheiro: number;
  pix: number;
  debito: number;
  credito: number;
  total_recebido: number;
  sangrias: number;
  suprimentos: number;
};

export type MovimentoCaixa = {
  id: number;
  sessao_id: number;
  tipo: TipoMovimento;
  valor: number;
  motivo: string | null;
  criado_por: string;
  criado_em: string;
};

export type VendaProduto = {
  sessao_id: number;
  produto_id: number;
  nome_produto: string;
  vendidos: number;
  faturado: number;
  cancelamentos: number;
};

export type ResumoSessao = {
  comandas: number;
  mesasAtendidas: number;
};

/** Igual a FechamentoSessao, mas somado por vários turnos (dia, mês, tudo). */
export type ResumoPeriodo = {
  pix: number;
  debito: number;
  credito: number;
  dinheiro: number;
  total_recebido: number;
  sangrias: number;
  suprimentos: number;
  comandas: number;
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

/** Comanda aberta de uma mesa, se houver — usado pra saber se a mesa já
 *  tem lançamento antes mesmo de tentar lançar o primeiro. */
export async function buscarComandaAbertaDaMesa(mesaId: number): Promise<ComandaInfo | null> {
  const { data, error } = await supabase
    .from("comandas")
    .select("id, mesa_id, status, apelido, aberta_em")
    .eq("mesa_id", mesaId)
    .eq("status", "aberta")
    .maybeSingle();
  if (error) throw error;
  return data as ComandaInfo | null;
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

/** Para a gestão: traz também categorias e produtos inativos, para reativar. */
export async function buscarCardapioCompleto() {
  const [cat, prod] = await Promise.all([
    supabase.from("categorias").select("*").order("ordem"),
    supabase.from("produtos").select("*").order("ordem"),
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

export async function buscarSessaoAberta(): Promise<SessaoCaixa | null> {
  const { data, error } = await supabase
    .from("sessoes_caixa")
    .select("*")
    .is("fechada_em", null)
    .maybeSingle();
  if (error) throw error;
  return data as SessaoCaixa | null;
}

export async function buscarSessoesRecentes(limite = 20): Promise<SessaoCaixa[]> {
  const { data, error } = await supabase
    .from("sessoes_caixa")
    .select("*")
    .order("aberta_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as SessaoCaixa[];
}

export async function buscarFechamentoSessao(sessaoId: number): Promise<FechamentoSessao | null> {
  const { data, error } = await supabase
    .from("v_fechamento_sessao")
    .select("*")
    .eq("sessao_id", sessaoId)
    .maybeSingle();
  if (error) throw error;
  return data as FechamentoSessao | null;
}

export async function buscarMovimentosCaixa(sessaoId: number): Promise<MovimentoCaixa[]> {
  const { data, error } = await supabase
    .from("movimentos_caixa")
    .select("*")
    .eq("sessao_id", sessaoId)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MovimentoCaixa[];
}

export async function buscarVendasProduto(sessaoId: number): Promise<VendaProduto[]> {
  const { data, error } = await supabase
    .from("v_vendas_produto")
    .select("*")
    .eq("sessao_id", sessaoId)
    .order("faturado", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VendaProduto[];
}

export async function buscarResumoSessao(sessaoId: number): Promise<ResumoSessao> {
  const { data, error } = await supabase
    .from("comandas")
    .select("mesa_id")
    .eq("sessao_id", sessaoId);
  if (error) throw error;
  const linhas = data ?? [];
  return {
    comandas: linhas.length,
    mesasAtendidas: new Set(linhas.map((l) => l.mesa_id)).size,
  };
}

/** Cancelamentos do turno — é o relatório que justifica a regra do dono existir. */
export async function buscarCancelamentos(sessaoId: number): Promise<Lancamento[]> {
  const { data: comandasDaSessao, error: erroComandas } = await supabase
    .from("comandas")
    .select("id")
    .eq("sessao_id", sessaoId);
  if (erroComandas) throw erroComandas;

  const ids = (comandasDaSessao ?? []).map((c) => c.id as number);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("lancamentos")
    .select("*")
    .in("comanda_id", ids)
    .not("cancelado_em", "is", null)
    .order("cancelado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Lancamento[];
}

/* ---------------- relatórios por período (dia / mês / tudo) ---------------- */
/* O turno continua sendo a unidade no banco — essas funções somam vários
   turnos de uma vez, pra quem quer o dia ou o mês inteiro sem abrir um
   por um. */

/** `fim` de fora (exclusivo) — passe null pra "sem limite" (turno em aberto incluso). */
export async function buscarSessoesNoPeriodo(inicio: Date, fim: Date | null): Promise<SessaoCaixa[]> {
  let query = supabase
    .from("sessoes_caixa")
    .select("*")
    .gte("aberta_em", inicio.toISOString())
    .order("aberta_em", { ascending: false });
  if (fim) query = query.lt("aberta_em", fim.toISOString());
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SessaoCaixa[];
}

/** Todos os turnos já registrados — pro "total geral". */
export async function buscarTodasAsSessoes(): Promise<SessaoCaixa[]> {
  const { data, error } = await supabase
    .from("sessoes_caixa")
    .select("*")
    .order("aberta_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SessaoCaixa[];
}

export async function buscarResumoPeriodo(sessaoIds: number[]): Promise<ResumoPeriodo> {
  const vazio: ResumoPeriodo = {
    pix: 0, debito: 0, credito: 0, dinheiro: 0, total_recebido: 0, sangrias: 0, suprimentos: 0, comandas: 0,
  };
  if (sessaoIds.length === 0) return vazio;

  const [comandasRes, movimentosRes] = await Promise.all([
    supabase.from("comandas").select("id").in("sessao_id", sessaoIds),
    supabase.from("movimentos_caixa").select("tipo, valor").in("sessao_id", sessaoIds),
  ]);
  if (comandasRes.error) throw comandasRes.error;
  if (movimentosRes.error) throw movimentosRes.error;

  const comandaIds = (comandasRes.data ?? []).map((c) => c.id as number);
  let pagamentos: { forma: FormaPagamento; valor: number }[] = [];
  if (comandaIds.length > 0) {
    const { data, error } = await supabase.from("pagamentos").select("forma, valor").in("comanda_id", comandaIds);
    if (error) throw error;
    pagamentos = (data ?? []) as { forma: FormaPagamento; valor: number }[];
  }
  const movimentos = (movimentosRes.data ?? []) as { tipo: TipoMovimento; valor: number }[];

  const porForma = (f: FormaPagamento) =>
    pagamentos.filter((p) => p.forma === f).reduce((s, p) => s + Number(p.valor), 0);
  const porTipo = (t: TipoMovimento) =>
    movimentos.filter((m) => m.tipo === t).reduce((s, m) => s + Number(m.valor), 0);

  return {
    pix: porForma("pix"),
    debito: porForma("debito"),
    credito: porForma("credito"),
    dinheiro: porForma("dinheiro"),
    total_recebido: pagamentos.reduce((s, p) => s + Number(p.valor), 0),
    sangrias: porTipo("sangria"),
    suprimentos: porTipo("suprimento"),
    comandas: comandaIds.length,
  };
}

/** Ranking de produtos somado entre vários turnos (v_vendas_produto já vem por turno). */
export async function buscarVendasPeriodo(sessaoIds: number[]): Promise<VendaProduto[]> {
  if (sessaoIds.length === 0) return [];
  const { data, error } = await supabase.from("v_vendas_produto").select("*").in("sessao_id", sessaoIds);
  if (error) throw error;

  const porProduto = new Map<number, VendaProduto>();
  for (const linha of (data ?? []) as VendaProduto[]) {
    const atual = porProduto.get(linha.produto_id);
    if (atual) {
      atual.vendidos += Number(linha.vendidos);
      atual.faturado += Number(linha.faturado);
      atual.cancelamentos += Number(linha.cancelamentos);
    } else {
      porProduto.set(linha.produto_id, {
        sessao_id: 0,
        produto_id: linha.produto_id,
        nome_produto: linha.nome_produto,
        vendidos: Number(linha.vendidos),
        faturado: Number(linha.faturado),
        cancelamentos: Number(linha.cancelamentos),
      });
    }
  }
  return [...porProduto.values()].sort((a, b) => b.faturado - a.faturado);
}

export async function buscarCancelamentosPeriodo(sessaoIds: number[]): Promise<Lancamento[]> {
  if (sessaoIds.length === 0) return [];
  const { data: comandasData, error: erroComandas } = await supabase
    .from("comandas")
    .select("id")
    .in("sessao_id", sessaoIds);
  if (erroComandas) throw erroComandas;

  const ids = (comandasData ?? []).map((c) => c.id as number);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("lancamentos")
    .select("*")
    .in("comanda_id", ids)
    .not("cancelado_em", "is", null)
    .order("cancelado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Lancamento[];
}

export async function buscarEquipe(): Promise<Perfil[]> {
  const { data, error } = await supabase
    .from("perfis")
    .select("id, nome, papel, ativo")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as Perfil[];
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
}): Promise<Lancamento> {
  const { data, error } = await supabase.rpc("lancar_item", {
    p_id: args.id,
    p_comanda: args.comandaId,
    p_produto: args.produtoId,
    p_quantidade: args.quantidade ?? 1,
    p_observacao: args.observacao ?? null,
  });
  if (error) throw error;
  return data as Lancamento;
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

/** Apelido livre da comanda aberta ("da Marcia", "aniversário") — passar
 *  string vazia limpa o apelido. Não mexe no rótulo físico da mesa. */
export async function renomearComanda(comandaId: number, apelido: string) {
  const { error } = await supabase.rpc("renomear_comanda", {
    p_comanda: comandaId,
    p_apelido: apelido,
  });
  if (error) throw error;
}

/* ---------------- gestão: caixa ---------------- */

export async function abrirSessaoCaixa(args: {
  troco: number;
  evento: boolean;
  couvert: number;
}): Promise<number> {
  const { data, error } = await supabase.rpc("abrir_sessao_caixa", {
    p_troco: args.troco,
    p_evento: args.evento,
    p_couvert: args.couvert,
  });
  if (error) throw error;
  return data as number;
}

export async function fecharSessaoCaixa(valorConferido: number, observacao?: string | null) {
  const { error } = await supabase.rpc("fechar_sessao_caixa", {
    p_valor_conferido: valorConferido,
    p_observacao: observacao ?? null,
  });
  if (error) throw error;
}

export async function registrarMovimentoCaixa(
  tipo: TipoMovimento,
  valor: number,
  motivo: string,
) {
  const { error } = await supabase.rpc("registrar_movimento_caixa", {
    p_tipo: tipo,
    p_valor: valor,
    p_motivo: motivo,
  });
  if (error) throw error;
}

/** Só o dono autoriza — exige o PIN dele, mesmo que quem esteja no aparelho seja outro. */
export async function alterarTrocoInicial(valor: number, pin: string): Promise<SessaoCaixa> {
  const { data, error } = await supabase.rpc("alterar_troco_inicial", {
    p_valor: valor,
    p_pin: pin,
  });
  if (error) throw error;
  return data as SessaoCaixa;
}

/* ---------------- gestão: cardápio ---------------- */
/* CRUD direto — RLS já exige papel dono/gerente (`e_gestor()`). */

export async function criarCategoria(args: {
  nome: string;
  destino: Destino;
  ordem?: number;
}): Promise<Categoria> {
  const { data, error } = await supabase
    .from("categorias")
    .insert({ nome: args.nome, destino: args.destino, ordem: args.ordem ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data as Categoria;
}

export async function atualizarCategoria(
  id: number,
  patch: Partial<Pick<Categoria, "nome" | "destino" | "ordem" | "ativa">>,
) {
  const { error } = await supabase.from("categorias").update(patch).eq("id", id);
  if (error) throw error;
}

export async function criarProduto(args: {
  categoria_id: number;
  nome: string;
  observacao?: string | null;
  preco: number;
  ordem?: number;
}): Promise<Produto> {
  const { data, error } = await supabase
    .from("produtos")
    .insert({
      categoria_id: args.categoria_id,
      nome: args.nome,
      observacao: args.observacao ?? null,
      preco: args.preco,
      ordem: args.ordem ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Produto;
}

export async function atualizarProduto(
  id: number,
  patch: Partial<Pick<Produto, "categoria_id" | "nome" | "observacao" | "preco" | "ordem" | "ativo">>,
) {
  const { error } = await supabase.from("produtos").update(patch).eq("id", id);
  if (error) throw error;
}

/** Toggle de disponibilidade — o caminho documentado no contrato de RPCs (SPEC §5). */
export async function alternarDisponibilidade(produtoId: number, disponivel: boolean) {
  const { error } = await supabase.rpc("alternar_disponibilidade", {
    p_produto: produtoId,
    p_disponivel: disponivel,
  });
  if (error) throw error;
}

/* ---------------- gestão: equipe ---------------- */

export async function atualizarPapelPerfil(id: string, papel: Papel) {
  const { error } = await supabase.from("perfis").update({ papel }).eq("id", id);
  if (error) throw error;
}

export async function atualizarAtivoPerfil(id: string, ativo: boolean) {
  const { error } = await supabase.from("perfis").update({ ativo }).eq("id", id);
  if (error) throw error;
}

export async function definirPin(pin: string) {
  const { error } = await supabase.rpc("definir_pin", { p_pin: pin });
  if (error) throw error;
}

/* ---------------- formato ---------------- */

export const dinheiro = (v: number) =>
  "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");

export const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export function tempoDesde(iso: string | null) {
  if (!iso) return "";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "aberta agora";
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}
