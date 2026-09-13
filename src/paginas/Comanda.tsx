import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  buscarCardapio,
  buscarLancamentos,
  cancelarLancamento,
  dinheiro,
  semAcento,
  supabase,
  type Categoria,
  type Lancamento,
  type Produto,
} from "../lib/api";
import {
  assinarFila,
  descartarPendente,
  enfileirar,
  type Pendente,
} from "../lib/fila";
import { ModalConta, ModalPin } from "../componentes/modais";

export default function Comanda() {
  const { id } = useParams();
  const comandaId = Number(id);
  const [params] = useSearchParams();
  const rotuloMesa = params.get("mesa") ?? "";
  const navegar = useNavigate();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [pago, setPago] = useState(0);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const [pinPara, setPinPara] = useState<Lancamento | null>(null);
  const [contaAberta, setContaAberta] = useState(false);
  const secoes = useRef<Record<number, HTMLElement | null>>({});

  const recarregar = useCallback(async () => {
    try {
      const [ls, pg] = await Promise.all([
        buscarLancamentos(comandaId),
        supabase.from("pagamentos").select("valor").eq("comanda_id", comandaId),
      ]);
      setLancamentos(ls);
      setPago((pg.data ?? []).reduce((s, p) => s + Number(p.valor), 0));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar a comanda.");
    }
  }, [comandaId]);

  useEffect(() => {
    void buscarCardapio()
      .then(({ categorias, produtos }) => {
        setCategorias(categorias);
        setProdutos(produtos);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha no cardápio."));

    void recarregar();
    const parar = assinarFila(setPendentes);

    const canal = supabase
      .channel(`comanda-${comandaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lancamentos", filter: `comanda_id=eq.${comandaId}` },
        () => void recarregar(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, () =>
        void buscarCardapio().then(({ produtos }) => setProdutos(produtos)),
      )
      .subscribe();

    return () => {
      parar();
      void supabase.removeChannel(canal);
    };
  }, [comandaId, recarregar]);

  /* quantidade na tela = o que o banco já confirmou + o que está na fila */
  const meusPendentes = useMemo(
    () => pendentes.filter((p) => p.comandaId === comandaId),
    [pendentes, comandaId],
  );

  const contagem = useMemo(() => {
    const m = new Map<number, { confirmados: number; pendentes: number }>();
    for (const l of lancamentos) {
      const a = m.get(l.produto_id) ?? { confirmados: 0, pendentes: 0 };
      a.confirmados += l.quantidade;
      m.set(l.produto_id, a);
    }
    for (const p of meusPendentes) {
      const a = m.get(p.produtoId) ?? { confirmados: 0, pendentes: 0 };
      a.pendentes += p.quantidade;
      m.set(p.produtoId, a);
    }
    return m;
  }, [lancamentos, meusPendentes]);

  const total = useMemo(
    () =>
      lancamentos.reduce((s, l) => s + l.quantidade * Number(l.preco_unitario), 0) +
      meusPendentes.reduce((s, p) => s + p.quantidade * p.precoUnitario, 0),
    [lancamentos, meusPendentes],
  );

  const totalItens = useMemo(
    () =>
      lancamentos.reduce((s, l) => s + l.quantidade, 0) +
      meusPendentes.reduce((s, p) => s + p.quantidade, 0),
    [lancamentos, meusPendentes],
  );

  function lancar(p: Produto) {
    if (!p.disponivel) return;
    enfileirar({
      id: crypto.randomUUID(),
      comandaId,
      produtoId: p.id,
      nomeProduto: p.nome,
      precoUnitario: Number(p.preco),
      quantidade: 1,
      observacao: null,
    });
  }

  /* tirar item:
     - ainda na fila  -> descarta local, não precisa de PIN (nada foi gravado)
     - já no banco    -> exige PIN do dono/gerente */
  function tirar(p: Produto) {
    const pendente = [...meusPendentes].reverse().find((x) => x.produtoId === p.id);
    if (pendente) {
      descartarPendente(pendente.id);
      return;
    }
    const gravado = [...lancamentos].reverse().find((l) => l.produto_id === p.id);
    if (gravado) setPinPara(gravado);
  }

  const filtrados = useMemo(() => {
    const f = semAcento(busca.trim());
    return categorias
      .map((c) => ({
        categoria: c,
        itens: produtos
          .filter((p) => p.categoria_id === c.id)
          .filter((p) => !f || semAcento(`${p.nome} ${p.observacao ?? ""} ${c.nome}`).includes(f)),
      }))
      .filter((g) => g.itens.length);
  }, [categorias, produtos, busca]);

  const naFila = meusPendentes.length;

  return (
    <>
      <div className="topo">
        <div className="dentro">
          <button className="botao-topo" onClick={() => navegar("/")}>Salão</button>
          <img className="topo-logo" src="/marca/logo-seu-barba-icone.svg" alt="" width={32} height={32} />
          <h1>
            {rotuloMesa === "Balcão" ? "Balcão" : `Mesa ${rotuloMesa}`}
            <span className="sub">Toque no item para lançar</span>
          </h1>
        </div>
        {naFila > 0 && (
          <p className="aviso-fila">
            {naFila} {naFila === 1 ? "item aguardando envio" : "itens aguardando envio"} — pode continuar lançando.
          </p>
        )}
        {erro && <p className="aviso-fila">{erro}</p>}
      </div>

      <main>
        <label className="busca">
          <span style={{ position: "absolute", left: -9999 }}>Buscar item</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar — cupim, heineken, caldinho…"
          />
        </label>

        <nav className="chips" aria-label="Seções do cardápio">
          {categorias.map((c) => (
            <button
              key={c.id}
              className="chip"
              onClick={() =>
                secoes.current[c.id]?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              {c.nome}
            </button>
          ))}
        </nav>

        <div className="tira">
          <div className="serrilha cima" />
          <div className="folha">
            {filtrados.length === 0 && <p className="vazio">Nada com esse nome.</p>}

            {filtrados.map(({ categoria, itens }) => (
              <section
                className="grupo"
                key={categoria.id}
                ref={(el) => { secoes.current[categoria.id] = el; }}
              >
                <h2>{categoria.nome}</h2>
                {itens.map((p) => {
                  const c = contagem.get(p.id) ?? { confirmados: 0, pendentes: 0 };
                  const q = c.confirmados + c.pendentes;
                  return (
                    <div
                      className={"item" + (p.disponivel ? "" : " indisponivel")}
                      data-qtd={q}
                      key={p.id}
                    >
                      <button
                        className={"qtd" + (c.pendentes > 0 ? " pendente" : "")}
                        onClick={() => lancar(p)}
                        aria-label={`Lançar ${p.nome}`}
                        disabled={!p.disponivel}
                      >
                        {q || ""}
                      </button>
                      <button
                        className="nome"
                        onClick={() => lancar(p)}
                        aria-label={`Lançar ${p.nome}`}
                        disabled={!p.disponivel}
                      >
                        {p.nome}
                        {p.observacao && <span className="obs">{p.observacao}</span>}
                        {!p.disponivel && <span className="esgotado">acabou</span>}
                      </button>
                      <span className="preco">
                        <small>R$</small>
                        {Number(p.preco).toFixed(2).replace(".", ",")}
                      </span>
                      <button
                        className="tirar"
                        onClick={() => tirar(p)}
                        aria-label={`Tirar um ${p.nome}`}
                      >
                        −
                      </button>
                    </div>
                  );
                })}
              </section>
            ))}

            <p className="rodape-menu">
              Não cobramos 10% · couvert em dia de evento · Pix, débito, crédito e dinheiro
            </p>
          </div>
          <div className="serrilha baixo" />
        </div>
      </main>

      {totalItens > 0 && (
        <div className="barra">
          <div className="dentro">
            <div className="resumo">
              <span className="itens">
                {totalItens} {totalItens === 1 ? "item lançado" : "itens lançados"}
              </span>
              <span className="total num">{dinheiro(total)}</span>
            </div>
            <button
              className="acao"
              onClick={() => setContaAberta(true)}
              disabled={naFila > 0}
              title={naFila > 0 ? "Aguarde o envio dos itens pendentes" : undefined}
            >
              Fechar conta
            </button>
          </div>
        </div>
      )}

      {pinPara && (
        <ModalPin
          nomeItem={pinPara.nome_produto}
          onFechar={() => setPinPara(null)}
          onConfirmar={async (motivo, pin) => {
            await cancelarLancamento(pinPara.id, motivo, pin);
            await recarregar();
          }}
        />
      )}

      {contaAberta && (
        <ModalConta
          comandaId={comandaId}
          lancamentos={lancamentos}
          total={total}
          pago={pago}
          onMudou={recarregar}
          onFechou={() => navegar("/")}
          onFechar={() => setContaAberta(false)}
        />
      )}
    </>
  );
}
