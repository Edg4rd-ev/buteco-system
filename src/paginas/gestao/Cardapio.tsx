import { useCallback, useEffect, useMemo, useState } from "react";
import {
  alternarDisponibilidade,
  atualizarCategoria,
  atualizarProduto,
  buscarCardapioCompleto,
  centavos,
  criarCategoria,
  criarProduto,
  dinheiro,
  type Categoria,
  type Destino,
  type Produto,
} from "../../lib/api";
import Carregando, { SpinnerBotao } from "../../componentes/Carregando";
import { useDesktop } from "../../lib/tela";
import InputDinheiro from "../../componentes/InputDinheiro";

const DESTINOS: { id: Destino; rotulo: string }[] = [
  { id: "chapa", rotulo: "Chapa" },
  { id: "cozinha", rotulo: "Cozinha" },
  { id: "balcao", rotulo: "Balcão" },
];

export default function Cardapio() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [categoriaAberta, setCategoriaAberta] = useState<number | "nova" | null>(null);
  const [produtoAberto, setProdutoAberto] = useState<
    { categoriaId: number; produto: Produto | null } | null
  >(null);

  const recarregar = useCallback(async () => {
    try {
      const { categorias, produtos } = await buscarCardapioCompleto();
      setCategorias(categorias);
      setProdutos(produtos);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o cardápio.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => void recarregar(), [recarregar]);

  const produtosPorCategoria = useMemo(() => {
    const m = new Map<number, Produto[]>();
    for (const p of produtos) {
      const lista = m.get(p.categoria_id) ?? [];
      lista.push(p);
      m.set(p.categoria_id, lista);
    }
    return m;
  }, [produtos]);

  /* desktop: duas colunas — categorias à esquerda, produtos em tabela à direita */
  const desktop = useDesktop();
  const [categoriaSel, setCategoriaSel] = useState<number | null>(null);
  const [busca, setBusca] = useState("");

  if (carregando) return <Carregando texto="Carregando o cardápio…" />;

  const modais = (
    <>
      {categoriaAberta !== null && (
        <ModalCategoria
          categoria={categoriaAberta === "nova" ? null : categorias.find((c) => c.id === categoriaAberta) ?? null}
          onFechar={() => setCategoriaAberta(null)}
          onSalvar={async (dados) => {
            if (categoriaAberta === "nova") await criarCategoria(dados);
            else await atualizarCategoria(categoriaAberta, dados);
            await recarregar();
          }}
        />
      )}

      {produtoAberto && (
        <ModalProduto
          produto={produtoAberto.produto}
          categoriaId={produtoAberto.categoriaId}
          onFechar={() => setProdutoAberto(null)}
          onSalvar={async (dados) => {
            if (produtoAberto.produto) await atualizarProduto(produtoAberto.produto.id, dados);
            else await criarProduto({ ...dados, categoria_id: produtoAberto.categoriaId });
            await recarregar();
          }}
        />
      )}
    </>
  );

  if (desktop) {
    const cat = categorias.find((c) => c.id === categoriaSel) ?? categorias[0] ?? null;
    const termo = busca.trim().toLowerCase();
    // com busca, procura no cardápio inteiro; sem busca, mostra a categoria escolhida
    const linhas = termo
      ? produtos.filter((p) => p.nome.toLowerCase().includes(termo))
      : cat ? produtosPorCategoria.get(cat.id) ?? [] : [];
    const nomeCategoria = (id: number) => categorias.find((c) => c.id === id)?.nome ?? "";

    return (
      <div className="painel painel-cardapio">
        {erro && <p className="aviso-fila">{erro}</p>}

        <aside className="cartao lista-categorias">
          <div className="cabecalho-cartao">
            <h2>Categorias</h2>
            <button className="botao-topo" onClick={() => setCategoriaAberta("nova")}>+ Nova</button>
          </div>
          {categorias.map((c) => (
            <button
              key={c.id}
              className="item-categoria"
              aria-current={!termo && cat?.id === c.id ? "true" : undefined}
              style={{ opacity: c.ativa ? 1 : 0.55 }}
              onClick={() => {
                setBusca("");
                setCategoriaSel(c.id);
              }}
            >
              <span>{c.nome}</span>
              <span className="contagem num">{produtosPorCategoria.get(c.id)?.length ?? 0}</span>
            </button>
          ))}
        </aside>

        <section className="cartao">
          <div className="cabecalho-produtos">
            <label className="busca-desktop">
              <span className="sr-only">Buscar produto</span>
              <input
                type="search"
                placeholder="Buscar produto no cardápio todo…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            {!termo && cat && (
              <div className="acoes-produto">
                <span className="badge">{DESTINOS.find((d) => d.id === cat.destino)?.rotulo}</span>
                <button className="botao-topo" onClick={() => setCategoriaAberta(cat.id)}>Editar categoria</button>
                <button className="botao-topo" onClick={() => atualizarCategoria(cat.id, { ativa: !cat.ativa }).then(recarregar)}>
                  {cat.ativa ? "Desativar" : "Reativar"}
                </button>
                <button
                  className="acao"
                  onClick={() => setProdutoAberto({ categoriaId: cat.id, produto: null })}
                >
                  + Novo produto
                </button>
              </div>
            )}
          </div>

          <h2 style={{ marginTop: 18 }}>
            {termo ? `${linhas.length} ${linhas.length === 1 ? "resultado" : "resultados"}` : cat?.nome ?? "Sem categorias"}
          </h2>

          {linhas.length === 0 ? (
            <p className="dica">{termo ? "Nada com esse nome." : "Nenhum produto nessa categoria ainda."}</p>
          ) : (
            <table className="tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  {termo && <th>Categoria</th>}
                  <th className="dir">Preço</th>
                  <th>Situação</th>
                  <th className="estreita"><span className="sr-only">Editar</span></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((p) => (
                  <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
                    <td>
                      {p.nome}
                      {p.observacao && <span className="obs-linha">{p.observacao}</span>}
                      {!p.ativo && <span className="obs-linha">removido do cardápio</span>}
                    </td>
                    {termo && <td className="fraco">{nomeCategoria(p.categoria_id)}</td>}
                    <td className="dir num">{dinheiro(p.preco)}</td>
                    <td>
                      <button
                        aria-pressed={p.disponivel}
                        className="chip-toggle"
                        onClick={() => alternarDisponibilidade(p.id, !p.disponivel).then(recarregar)}
                      >
                        {p.disponivel ? "Disponível" : "Acabou"}
                      </button>
                    </td>
                    <td className="estreita">
                      <button
                        className="botao-icone"
                        aria-label={`Editar ${p.nome}`}
                        onClick={() => setProdutoAberto({ categoriaId: p.categoria_id, produto: p })}
                      >
                        ✎
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {modais}
      </div>
    );
  }

  return (
    <div className="painel">
      {erro && <p className="aviso-fila">{erro}</p>}

      <div className="acoes">
        <button className="principal" onClick={() => setCategoriaAberta("nova")}>+ Nova categoria</button>
      </div>

      {categorias.map((c) => (
        <section className="cartao" key={c.id} style={{ opacity: c.ativa ? 1 : 0.55 }}>
          <div className="cabecalho-cartao">
            <h2>{c.nome}</h2>
            <span className="badge">{DESTINOS.find((d) => d.id === c.destino)?.rotulo}</span>
          </div>

          <div className="acoes">
            <button className="secundario" onClick={() => setCategoriaAberta(c.id)}>Editar</button>
            <button
              className={c.ativa ? "secundario" : "principal"}
              onClick={() => atualizarCategoria(c.id, { ativa: !c.ativa }).then(recarregar)}
            >
              {c.ativa ? "Desativar categoria" : "Reativar categoria"}
            </button>
          </div>

          <div className="lista" style={{ marginTop: 14 }}>
            {(produtosPorCategoria.get(c.id) ?? []).map((p) => (
              <div className="linha-produto" key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
                <div className="info-produto">
                  <span className="nome-produto">{p.nome}</span>
                  {p.observacao && <span className="obs-linha">{p.observacao}</span>}
                  <span className="preco-produto">{dinheiro(p.preco)}</span>
                </div>
                <div className="acoes-produto">
                  <button
                    aria-pressed={p.disponivel}
                    className="chip-toggle"
                    onClick={() => alternarDisponibilidade(p.id, !p.disponivel).then(recarregar)}
                  >
                    {p.disponivel ? "Disponível" : "Acabou"}
                  </button>
                  <button
                    className="botao-icone"
                    aria-label={`Editar ${p.nome}`}
                    onClick={() => setProdutoAberto({ categoriaId: c.id, produto: p })}
                  >
                    ✎
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="acoes" style={{ marginTop: 10 }}>
            <button
              className="secundario"
              onClick={() => setProdutoAberto({ categoriaId: c.id, produto: null })}
            >
              + Novo produto
            </button>
          </div>
        </section>
      ))}

      {modais}
    </div>
  );
}

function ModalCategoria({
  categoria,
  onSalvar,
  onFechar,
}: {
  categoria: Categoria | null;
  onSalvar: (dados: { nome: string; destino: Destino; ordem: number }) => Promise<void>;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(categoria?.nome ?? "");
  const [destino, setDestino] = useState<Destino>(categoria?.destino ?? "balcao");
  const [ordem, setOrdem] = useState(String(categoria?.ordem ?? 0));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro("Nome é obrigatório.");
    const n = Number(ordem);
    if (Number.isNaN(n)) return setErro("Ordem precisa ser um número.");

    setEnviando(true);
    try {
      await onSalvar({ nome: nome.trim(), destino, ordem: n });
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="fundo" onClick={onFechar} />
      <div className="caixa">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h3>{categoria ? "Editar categoria" : "Nova categoria"}</h3>

        <label htmlFor="nome-cat">Nome</label>
        <input id="nome-cat" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Petiscos, Bebidas…" />

        <label htmlFor="destino-cat">Roteamento de produção</label>
        <select
          id="destino-cat"
          value={destino}
          onChange={(e) => setDestino(e.target.value as Destino)}
        >
          {DESTINOS.map((d) => (
            <option key={d.id} value={d.id}>{d.rotulo}</option>
          ))}
        </select>

        <label htmlFor="ordem-cat">Ordem de exibição</label>
        <input id="ordem-cat" inputMode="numeric" value={ordem} onChange={(e) => setOrdem(e.target.value)} />

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes">
          <button className="secundario" onClick={onFechar}>Voltar</button>
          <button className="principal" onClick={salvar} disabled={enviando}>
            {enviando && <SpinnerBotao />}
            {enviando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalProduto({
  produto,
  onSalvar,
  onFechar,
}: {
  produto: Produto | null;
  categoriaId: number;
  onSalvar: (dados: { nome: string; observacao: string | null; preco: number; ordem: number; ativo?: boolean }) => Promise<void>;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [observacao, setObservacao] = useState(produto?.observacao ?? "");
  const [preco, setPreco] = useState(() => (produto ? centavos(produto.preco) : 0));
  const [ordem, setOrdem] = useState(String(produto?.ordem ?? 0));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const precoMudou = produto ? preco !== centavos(produto.preco) : false;

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro("Nome é obrigatório.");
    // o campo começa em R$ 0,00 — produto de graça quase sempre é preço esquecido
    if (preco <= 0) return setErro("Informe o preço.");
    const o = Number(ordem);
    if (Number.isNaN(o)) return setErro("Ordem precisa ser um número.");

    setEnviando(true);
    try {
      await onSalvar({ nome: nome.trim(), observacao: observacao.trim() || null, preco, ordem: o });
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo() {
    if (!produto) return;
    setEnviando(true);
    try {
      await onSalvar({
        nome: produto.nome,
        observacao: produto.observacao,
        preco: Number(produto.preco),
        ordem: produto.ordem,
        ativo: !produto.ativo,
      });
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="fundo" onClick={onFechar} />
      <div className="caixa">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h3>{produto ? "Editar produto" : "Novo produto"}</h3>

        <label htmlFor="nome-prod">Nome</label>
        <input id="nome-prod" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Cupim, Heineken…" />

        <label htmlFor="obs-prod">Observação (aparece no cardápio)</label>
        <input id="obs-prod" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="500ml, serve 2…" />

        <label htmlFor="preco-prod">Preço</label>
        <InputDinheiro id="preco-prod" valor={preco} onChange={setPreco} />
        {precoMudou && (
          <p className="dica" style={{ color: "var(--dourado-fosco)" }}>
            Comandas já abertas mantêm o preço antigo — o lançamento congela o valor na hora.
          </p>
        )}

        <label htmlFor="ordem-prod">Ordem de exibição</label>
        <input id="ordem-prod" inputMode="numeric" value={ordem} onChange={(e) => setOrdem(e.target.value)} />

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes">
          <button className="secundario" onClick={onFechar}>Voltar</button>
          <button className="principal" onClick={salvar} disabled={enviando}>
            {enviando && <SpinnerBotao />}
            {enviando ? "Salvando…" : "Salvar"}
          </button>
        </div>

        {produto && (
          <div className="acoes" style={{ marginTop: 10 }}>
            <button className={produto.ativo ? "perigo" : "secundario"} onClick={alternarAtivo} disabled={enviando}>
              {enviando && <SpinnerBotao />}
              {produto.ativo ? "Remover do cardápio (mantém histórico)" : "Voltar ao cardápio"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
