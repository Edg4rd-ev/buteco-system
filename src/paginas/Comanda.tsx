import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  abrirComanda,
  alterarPessoasComanda,
  buscarCardapio,
  buscarComandaAbertaDaMesa,
  buscarLancamentos,
  buscarSessaoAberta,
  cancelarAberturaComanda,
  cancelarLancamento,
  dinheiro,
  valorBr,
  renomearComanda,
  semAcento,
  supabase,
  type Categoria,
  type Lancamento,
  type Produto,
} from "../lib/api";
import {
  assinarConfirmados,
  assinarErros,
  assinarFila,
  descartarPendente,
  enfileirar,
  type Pendente,
} from "../lib/fila";
import { ModalApelido, ModalConta, ModalPin } from "../componentes/modais";

export default function Comanda() {
  const { mesaId: mesaIdParam } = useParams();
  const mesaId = Number(mesaIdParam);
  const [params] = useSearchParams();
  const rotuloMesa = params.get("mesa") ?? "";
  const navegar = useNavigate();

  // a comanda só existe no banco a partir do primeiro lançamento confirmado
  // (ou já existia, se a mesa estava ocupada quando entramos). Até lá fica
  // null — não tem o que buscar, não tem o que fechar.
  const [comandaId, setComandaId] = useState<number | null>(null);
  const [apelido, setApelido] = useState<string | null>(null);
  // couvert é por cabeça: antes da comanda existir vem do turno; depois,
  // o valor congelado na comanda é que vale
  const [pessoas, setPessoas] = useState(1);
  const [couvertPorPessoa, setCouvertPorPessoa] = useState(0);
  const [mudandoPessoas, setMudandoPessoas] = useState(false);
  const [tirandoPessoa, setTirandoPessoa] = useState(false);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [pago, setPago] = useState(0);
  // o que já foi pago item a item (quem saiu mais cedo)
  const [itensPagos, setItensPagos] = useState<Set<string>>(new Set());
  const [couvertsPagos, setCouvertsPagos] = useState(0);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const [pinPara, setPinPara] = useState<Lancamento | null>(null);
  const [contaAberta, setContaAberta] = useState(false);
  const [apelidoAberto, setApelidoAberto] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const secoes = useRef<Record<number, HTMLElement | null>>({});

  /* Vários itens lançados em sequência rápida disparam um evento realtime
     por linha, e cada um chama recarregar() de novo. Essas buscas não são
     sequenciadas — uma iniciada mais cedo pode responder depois de uma mais
     nova e sobrescrever o estado com menos itens do que realmente tem. O
     contador de chamada garante que só a resposta mais recente é aplicada. */
  const chamadaRecarregar = useRef(0);

  const recarregar = useCallback(async () => {
    if (comandaId === null) return;
    const minhaChamada = ++chamadaRecarregar.current;
    try {
      const [ls, pg, cm] = await Promise.all([
        buscarLancamentos(comandaId),
        supabase
          .from("pagamentos")
          .select("valor, couvert_pessoas, pagamento_itens(lancamento_id)")
          .eq("comanda_id", comandaId),
        supabase.from("comandas").select("pessoas, couvert_por_pessoa").eq("id", comandaId).single(),
      ]);
      if (minhaChamada !== chamadaRecarregar.current) return; // resposta velha, ignora
      setLancamentos(ls);
      if (pg.error) throw pg.error;
      const pagamentos = pg.data ?? [];
      setPago(pagamentos.reduce((s, p) => s + Number(p.valor), 0));
      setCouvertsPagos(pagamentos.reduce((s, p) => s + Number(p.couvert_pessoas), 0));
      setItensPagos(
        new Set(pagamentos.flatMap((p) => (p.pagamento_itens ?? []).map((i) => i.lancamento_id as string))),
      );
      if (cm.data) {
        setPessoas(cm.data.pessoas);
        setCouvertPorPessoa(Number(cm.data.couvert_por_pessoa));
      }
    } catch (e) {
      if (minhaChamada !== chamadaRecarregar.current) return;
      setErro(e instanceof Error ? e.message : "Falha ao carregar a comanda.");
    }
  }, [comandaId]);

  // uma vez por mesa: cardápio, fila local e descobrir se já tem comanda aberta
  useEffect(() => {
    void buscarCardapio()
      .then(({ categorias, produtos }) => {
        setCategorias(categorias);
        setProdutos(produtos);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha no cardápio."));

    buscarComandaAbertaDaMesa(mesaId)
      .then((c) => {
        if (c) {
          setComandaId(c.id);
          setApelido(c.apelido);
          setPessoas(c.pessoas);
          setCouvertPorPessoa(Number(c.couvert_por_pessoa));
        } else {
          // mesa livre: mostra o couvert do turno pra já dar pra contar as pessoas
          return buscarSessaoAberta().then((s) => {
            if (s?.evento) setCouvertPorPessoa(Number(s.couvert_valor));
          });
        }
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao abrir a mesa."));

    const parar = assinarFila(setPendentes);

    // some da fila e vira lançamento confirmado no mesmo instante — é
    // também assim que a tela descobre o comanda_id da primeira vez,
    // já que ele só passa a existir quando o 1º item é confirmado.
    const pararConfirmados = assinarConfirmados((l, mid) => {
      if (mid !== mesaId) return;
      setComandaId((atual) => atual ?? l.comanda_id);
      setLancamentos((atual) => (atual.some((x) => x.id === l.id) ? atual : [...atual, l]));
    });

    // item recusado (regra, não rede) some da fila em silêncio — sem isso
    // o garçom nunca fica sabendo que o toque dele não valeu.
    const pararErros = assinarErros((p) => {
      if (p.mesaId !== mesaId) return;
      setErro(`${p.nomeProduto} não foi lançado: ${p.erro}`);
      // abrir_comanda pode ter criado a comanda mesmo o lançamento tendo
      // falhado em seguida (produto ficou indisponível etc.) — reconfere
      // pra não deixar a mesa "presa" ocupada e vazia sem jeito de fechar.
      buscarComandaAbertaDaMesa(mesaId)
        .then((c) => {
          if (c) {
            setComandaId((atual) => atual ?? c.id);
            setApelido((atual) => atual ?? c.apelido);
          }
        })
        .catch(() => {});
    });

    const canalProdutos = supabase
      .channel(`mesa-${mesaId}-produtos`)
      .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, () =>
        void buscarCardapio().then(({ produtos }) => setProdutos(produtos)),
      )
      .subscribe();

    return () => {
      parar();
      pararConfirmados();
      pararErros();
      void supabase.removeChannel(canalProdutos);
    };
  }, [mesaId]);

  // só a partir do momento em que a comanda existe: busca o que já tem
  // gravado e assina o realtime dela especificamente
  useEffect(() => {
    if (comandaId === null) return;
    void recarregar();

    const canal = supabase
      .channel(`comanda-${comandaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lancamentos", filter: `comanda_id=eq.${comandaId}` },
        () => void recarregar(),
      )
      // pagamento feito em outro aparelho: atualiza o que já está pago
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pagamentos", filter: `comanda_id=eq.${comandaId}` },
        () => void recarregar(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "comandas", filter: `id=eq.${comandaId}` },
        (payload) => {
          const nova = payload.new as { apelido: string | null; pessoas?: number };
          setApelido(nova.apelido ?? null);
          if (nova.pessoas) setPessoas(nova.pessoas);
        },
      )
      .subscribe();

    return () => void supabase.removeChannel(canal);
  }, [comandaId, recarregar]);

  /* quantidade na tela = o que o banco já confirmou + o que está na fila */
  const meusPendentes = useMemo(
    () => pendentes.filter((p) => p.mesaId === mesaId),
    [pendentes, mesaId],
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

  // só conta depois que a comanda existe — antes disso ninguém deve nada
  const couvert = comandaId !== null ? pessoas * couvertPorPessoa : 0;

  const total = useMemo(
    () =>
      lancamentos.reduce((s, l) => s + l.quantidade * Number(l.preco_unitario), 0) +
      meusPendentes.reduce((s, p) => s + p.quantidade * p.precoUnitario, 0) +
      couvert,
    [lancamentos, meusPendentes, couvert],
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
      mesaId,
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
    // item já pago não se cancela — tira um dos que ainda estão em aberto
    const gravado = [...lancamentos]
      .reverse()
      .find((l) => l.produto_id === p.id && !itensPagos.has(l.id));
    if (gravado) setPinPara(gravado);
  }

  /* garçom soma pessoas na mesa conforme o pessoal chega. Se a mesa
     ainda não foi aberta (nenhum item lançado), contar gente já abre a
     comanda — o couvert passa a valer a partir daí. Tirar pessoa é pelo
     modal de PIN (tirandoPessoa), igual cancelar item. */
  async function adicionarPessoa() {
    const novo = pessoas + 1;
    setErro(null);
    setMudandoPessoas(true);
    try {
      const id = comandaId ?? (await abrirComanda(mesaId, novo));
      // abrir_comanda devolve a existente se outra tela abriu antes,
      // então grava as pessoas sempre, em vez de confiar no p_pessoas
      await alterarPessoasComanda(id, novo);
      setPessoas(novo);
      setComandaId(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível mudar as pessoas.");
    } finally {
      setMudandoPessoas(false);
    }
  }

  /* mesa foi aberta (existe comanda) mas nada chegou a ser lançado —
     fecha sem PIN, porque não há nada pra proteger: nenhum item nem
     pagamento. O couvert não conta: é de gente que não ficou. */
  async function cancelarAbertura() {
    if (comandaId === null) return;
    setCancelando(true);
    try {
      await cancelarAberturaComanda(comandaId);
      navegar("/");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível cancelar a abertura.");
    } finally {
      setCancelando(false);
    }
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
  const mesaAbertaVazia = comandaId !== null && totalItens === 0;

  /* o aviso "aguardando envio" só aparece se o pendente demorar de
     verdade (rede lenta, offline) — o caso comum é confirmar em
     bem menos que isso, e mostrar toda hora só pisca a tela à toa. */
  const [avisoFilaVisivel, setAvisoFilaVisivel] = useState(false);
  useEffect(() => {
    if (naFila === 0) {
      setAvisoFilaVisivel(false);
      return;
    }
    const t = setTimeout(() => setAvisoFilaVisivel(true), 600);
    return () => clearTimeout(t);
  }, [naFila > 0]);

  return (
    <>
      <div className="topo">
        <div className="dentro">
          <button className="botao-topo" onClick={() => navegar("/")}>Salão</button>
          <h1>
            {rotuloMesa === "Balcão" ? "Balcão" : `Mesa ${rotuloMesa}`}
            <span className="sub">{apelido || "Toque no item para lançar"}</span>
          </h1>
          {comandaId !== null && (
            <button
              className="botao-icone"
              onClick={() => setApelidoAberto(true)}
              aria-label={apelido ? "Renomear mesa" : "Dar nome à mesa"}
            >
              ✎
            </button>
          )}
        </div>
        {couvertPorPessoa > 0 && (
          <div className="aviso-fila aviso-linha">
            <span>
              Couvert · {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"} × {dinheiro(couvertPorPessoa)}
              {comandaId !== null && <> = <strong>{dinheiro(couvert)}</strong></>}
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              <button
                className="botao-icone"
                onClick={() => setTirandoPessoa(true)}
                disabled={mudandoPessoas || comandaId === null || pessoas <= 1}
                aria-label="Tirar uma pessoa"
              >
                −
              </button>
              <button
                className="botao-icone"
                onClick={adicionarPessoa}
                disabled={mudandoPessoas}
                aria-label="Adicionar uma pessoa"
              >
                +
              </button>
            </span>
          </div>
        )}
        {mesaAbertaVazia && (
          <div className="aviso-fila aviso-linha">
            <span>Mesa aberta, nada lançado ainda.</span>
            <button className="botao-topo" onClick={cancelarAbertura} disabled={cancelando}>
              {cancelando ? "Cancelando…" : "Cancelar abertura"}
            </button>
          </div>
        )}
        {avisoFilaVisivel && (
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
                        {valorBr(p.preco)}
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

      {(totalItens > 0 || couvert > 0) && (
        <div className="barra">
          <div className="dentro">
            <div className="resumo">
              <span className="itens">
                {totalItens === 0
                  ? "Só couvert"
                  : `${totalItens} ${totalItens === 1 ? "item lançado" : "itens lançados"}`}
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

      {tirandoPessoa && comandaId !== null && (
        <ModalPin
          titulo={`Tirar 1 pessoa (${pessoas} → ${pessoas - 1})`}
          dica={`Diminui o couvert em ${dinheiro(couvertPorPessoa)}. Exige autorização do dono ou gerente — e fica registrado com o nome de quem autorizou.`}
          exemploMotivo="contou a mais, pessoa foi embora…"
          rotuloAcao="Tirar pessoa"
          onFechar={() => setTirandoPessoa(false)}
          onConfirmar={async (motivo, pin) => {
            const novo = pessoas - 1;
            await alterarPessoasComanda(comandaId, novo, { motivo, pin });
            setPessoas(novo);
          }}
        />
      )}

      {apelidoAberto && comandaId !== null && (
        <ModalApelido
          apelidoAtual={apelido}
          onFechar={() => setApelidoAberto(false)}
          onConfirmar={async (novoApelido) => {
            await renomearComanda(comandaId, novoApelido);
            setApelido(novoApelido || null);
          }}
        />
      )}

      {contaAberta && comandaId !== null && (
        <ModalConta
          comandaId={comandaId}
          lancamentos={lancamentos}
          total={total}
          pago={pago}
          itensPagos={itensPagos}
          pessoas={pessoas}
          couvertPorPessoa={comandaId !== null ? couvertPorPessoa : 0}
          couvertsPagos={couvertsPagos}
          onMudou={recarregar}
          onFechou={() => navegar("/")}
          onFechar={() => setContaAberta(false)}
        />
      )}
    </>
  );
}
