import { useEffect, useMemo, useState } from "react";
import {
  buscarCancelamentos,
  buscarCancelamentosPeriodo,
  buscarEquipe,
  buscarFechamentoSessao,
  buscarResumoPeriodo,
  buscarResumoSessao,
  buscarSessoesNoPeriodo,
  buscarSessoesRecentes,
  buscarTodasAsSessoes,
  buscarVendasPeriodo,
  buscarVendasProduto,
  dataHora,
  dinheiro,
  type FechamentoSessao,
  type Lancamento,
  type ResumoPeriodo,
  type ResumoSessao,
  type SessaoCaixa,
  type VendaProduto,
} from "../../lib/api";
import Carregando from "../../componentes/Carregando";
import { useDesktop } from "../../lib/tela";

type Modo = "turno" | "dia" | "mes" | "tudo";

const MODOS: { id: Modo; rotulo: string }[] = [
  { id: "turno", rotulo: "Turno" },
  { id: "dia", rotulo: "Dia" },
  { id: "mes", rotulo: "Mês" },
  { id: "tudo", rotulo: "Total geral" },
];

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // corrige pro fuso local antes de fatiar
  return d.toISOString().slice(0, 10);
}
function mesAtualISO() {
  return hojeISO().slice(0, 7);
}

export default function Relatorios() {
  const [modo, setModo] = useState<Modo>("turno");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  /* modo turno */
  const [sessoesRecentes, setSessoesRecentes] = useState<SessaoCaixa[]>([]);
  const [sessaoId, setSessaoId] = useState<number | null>(null);
  const [fechamentoTurno, setFechamentoTurno] = useState<FechamentoSessao | null>(null);
  const [resumoTurno, setResumoTurno] = useState<ResumoSessao | null>(null);

  /* modos dia / mês / tudo */
  const [dia, setDia] = useState(hojeISO);
  const [mes, setMes] = useState(mesAtualISO);
  const [sessoesPeriodo, setSessoesPeriodo] = useState<SessaoCaixa[]>([]);
  const [resumoPeriodo, setResumoPeriodo] = useState<ResumoPeriodo | null>(null);

  /* comuns aos dois */
  const [vendas, setVendas] = useState<VendaProduto[]>([]);
  const [cancelamentos, setCancelamentos] = useState<Lancamento[]>([]);

  /* desktop: a tabela de cancelamentos mostra quem cancelou e quem autorizou */
  const desktop = useDesktop();
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!desktop) return;
    buscarEquipe()
      .then((equipe) => setNomes(new Map(equipe.map((p) => [p.id, p.nome]))))
      .catch(() => setNomes(new Map())); // sem os nomes a tabela continua funcionando
  }, [desktop]);

  // lista de turnos pro seletor — carrega uma vez
  useEffect(() => {
    buscarSessoesRecentes()
      .then((lista) => {
        setSessoesRecentes(lista);
        if (lista.length) setSessaoId(lista[0].id);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao listar turnos."));
  }, []);

  // modo turno: dados de UM turno
  useEffect(() => {
    if (modo !== "turno" || sessaoId === null) return;
    setCarregando(true);
    Promise.all([
      buscarFechamentoSessao(sessaoId),
      buscarResumoSessao(sessaoId),
      buscarVendasProduto(sessaoId),
      buscarCancelamentos(sessaoId),
    ])
      .then(([f, r, v, c]) => {
        setFechamentoTurno(f);
        setResumoTurno(r);
        setVendas(v);
        setCancelamentos(c);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar o relatório."))
      .finally(() => setCarregando(false));
  }, [modo, sessaoId]);

  // modos dia / mês / tudo: soma vários turnos
  useEffect(() => {
    if (modo === "turno") return;
    setCarregando(true);

    const buscarSessoes = () => {
      if (modo === "tudo") return buscarTodasAsSessoes();
      let inicio: Date;
      let fim: Date;
      if (modo === "dia") {
        inicio = new Date(`${dia}T00:00:00`);
        fim = new Date(inicio);
        fim.setDate(fim.getDate() + 1);
      } else {
        inicio = new Date(`${mes}-01T00:00:00`);
        fim = new Date(inicio);
        fim.setMonth(fim.getMonth() + 1);
      }
      return buscarSessoesNoPeriodo(inicio, fim);
    };

    buscarSessoes()
      .then(async (sessoes) => {
        setSessoesPeriodo(sessoes);
        const ids = sessoes.map((s) => s.id);
        const [r, v, c] = await Promise.all([
          buscarResumoPeriodo(ids),
          buscarVendasPeriodo(ids),
          buscarCancelamentosPeriodo(ids),
        ]);
        setResumoPeriodo(r);
        setVendas(v);
        setCancelamentos(c);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar o relatório."))
      .finally(() => setCarregando(false));
  }, [modo, dia, mes]);

  /* ---------------- unifica turno x período pra renderizar ---------------- */

  const pagamento = modo === "turno" ? fechamentoTurno : resumoPeriodo;
  const comandas = modo === "turno" ? (resumoTurno?.comandas ?? 0) : (resumoPeriodo?.comandas ?? 0);
  const labelComandas = modo === "turno" ? "Mesas atendidas" : "Comandas atendidas";
  const pronto = modo === "turno" ? !!(fechamentoTurno && resumoTurno) : !!resumoPeriodo;
  const qtdTurnos = modo === "turno" ? 1 : sessoesPeriodo.length;

  const ticketMedio = useMemo(() => {
    if (!pagamento || comandas === 0) return 0;
    return Number(pagamento.total_recebido) / comandas;
  }, [pagamento, comandas]);

  const tituloPeriodo = useMemo(() => {
    if (modo === "turno") {
      const s = sessoesRecentes.find((s) => s.id === sessaoId);
      if (!s) return "";
      return `Turno de ${dataHora(s.aberta_em)}${s.fechada_em ? ` até ${dataHora(s.fechada_em)}` : " (em andamento)"}`;
    }
    if (modo === "dia") return new Date(`${dia}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    if (modo === "mes") {
      const [ano, m] = mes.split("-");
      return `${NOMES_MES[Number(m) - 1]} de ${ano}`;
    }
    return "Total geral — todos os turnos";
  }, [modo, sessaoId, sessoesRecentes, dia, mes]);

  const textoExport = useMemo(() => {
    if (!pagamento) return "";
    const linhas = [
      `Buteco Seu Barba — ${tituloPeriodo}`,
      modo !== "turno" ? `${qtdTurnos} ${qtdTurnos === 1 ? "turno" : "turnos"} no período` : "",
      ``,
      `Pix: ${dinheiro(pagamento.pix)}`,
      `Débito: ${dinheiro(pagamento.debito)}`,
      `Crédito: ${dinheiro(pagamento.credito)}`,
      `Dinheiro: ${dinheiro(pagamento.dinheiro)}`,
      `Total recebido: ${dinheiro(pagamento.total_recebido)}`,
      `Sangrias: ${dinheiro(pagamento.sangrias)}`,
      `Suprimentos: ${dinheiro(pagamento.suprimentos)}`,
      ``,
      `${labelComandas}: ${comandas}`,
      `Ticket médio: ${dinheiro(ticketMedio)}`,
      `Cancelamentos: ${cancelamentos.length}`,
      ``,
      `Ranking de produtos:`,
      ...vendas.map((v) => `  ${v.vendidos}× ${v.nome_produto} — ${dinheiro(v.faturado)}`),
    ].filter((l) => l !== "");
    return linhas.join("\n");
  }, [pagamento, tituloPeriodo, modo, qtdTurnos, labelComandas, comandas, ticketMedio, cancelamentos, vendas]);

  function copiarTexto() {
    void navigator.clipboard.writeText(textoExport).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  function baixarCsv() {
    const cabecalho = "produto,vendidos,faturado,cancelamentos";
    const linhas = vendas.map(
      (v) => `${csv(v.nome_produto)},${v.vendidos},${Number(v.faturado).toFixed(2)},${v.cancelamentos}`,
    );
    const blob = new Blob([[cabecalho, ...linhas].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${modo}-vendas.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (carregando && !pagamento) return <Carregando texto="Carregando relatórios…" />;

  const chipsModo = (
    <nav className="sub-nav" aria-label="Período do relatório">
      {MODOS.map((m) => (
        <button
          key={m.id}
          className="chip"
          aria-pressed={modo === m.id}
          onClick={() => setModo(m.id)}
        >
          {m.rotulo}
        </button>
      ))}
    </nav>
  );

  const seletorPeriodo = (
    <>
      {modo === "turno" && (
        <>
          <label htmlFor="sessao-sel">Turno</label>
          <select id="sessao-sel" value={sessaoId ?? ""} onChange={(e) => setSessaoId(Number(e.target.value))}>
            {sessoesRecentes.map((s) => (
              <option key={s.id} value={s.id}>
                {dataHora(s.aberta_em)} {s.fechada_em ? `→ ${dataHora(s.fechada_em)}` : "· em andamento"}
              </option>
            ))}
          </select>
        </>
      )}
      {modo === "dia" && (
        <>
          <label htmlFor="dia-sel">Dia</label>
          <input id="dia-sel" type="date" value={dia} onChange={(e) => setDia(e.target.value)} max={hojeISO()} />
        </>
      )}
      {modo === "mes" && (
        <>
          <label htmlFor="mes-sel">Mês</label>
          <input id="mes-sel" type="month" value={mes} onChange={(e) => setMes(e.target.value)} max={mesAtualISO()} />
        </>
      )}
      {modo === "tudo" && <p className="dica" style={{ margin: 0 }}>Soma de todos os turnos já registrados.</p>}
    </>
  );

  const contagemTurnos = modo !== "turno" && (
    <p className="dica" style={{ marginTop: 10, marginBottom: 0 }}>
      {qtdTurnos === 0
        ? "Nenhum turno nesse período."
        : `${qtdTurnos} ${qtdTurnos === 1 ? "turno encontrado" : "turnos encontrados"}.`}
    </p>
  );

  if (desktop) {
    const formas = pagamento
      ? [
          { rotulo: "Pix", valor: Number(pagamento.pix) },
          { rotulo: "Débito", valor: Number(pagamento.debito) },
          { rotulo: "Crédito", valor: Number(pagamento.credito) },
          { rotulo: "Dinheiro", valor: Number(pagamento.dinheiro) },
        ]
      : [];
    const totalRecebido = pagamento ? Number(pagamento.total_recebido) : 0;
    const maiorForma = Math.max(...formas.map((f) => f.valor), 0);
    const totalFaturado = vendas.reduce((s, v) => s + Number(v.faturado), 0);
    const nome = (id: string | null) => (id ? nomes.get(id) ?? "—" : "—");

    return (
      <div className="painel painel-relatorios">
        {erro && <p className="aviso-fila">{erro}</p>}

        <section className="cartao barra-filtros">
          {chipsModo}
          <div className="filtro-periodo">
            {seletorPeriodo}
            {contagemTurnos}
          </div>
          <div className="acoes-export">
            <button className="botao-topo" onClick={copiarTexto} disabled={!pronto}>
              {copiado ? "Copiado!" : "Copiar pro WhatsApp"}
            </button>
            <button className="botao-topo" onClick={baixarCsv} disabled={!pronto}>Baixar CSV</button>
          </div>
        </section>

        {pronto && pagamento && (
          <>
            <h2 className="titulo-periodo">{tituloPeriodo}</h2>

            <div className="kpis">
              <div className="kpi">
                <span>Total recebido</span>
                <strong className="num">{dinheiro(totalRecebido)}</strong>
              </div>
              <div className="kpi">
                <span>{labelComandas}</span>
                <strong className="num">{comandas}</strong>
              </div>
              <div className="kpi">
                <span>Ticket médio</span>
                <strong className="num">{dinheiro(ticketMedio)}</strong>
              </div>
              <div className="kpi">
                <span>Cancelamentos</span>
                <strong className="num">{cancelamentos.length}</strong>
              </div>
            </div>

            <div className="grade-relatorio">
              <section className="cartao">
                <h2>Por forma de pagamento</h2>
                <div className="barras">
                  {formas.map((f) => {
                    const pct = totalRecebido > 0 ? (f.valor / totalRecebido) * 100 : 0;
                    return (
                      <div
                        className="barra-linha"
                        key={f.rotulo}
                        title={`${f.rotulo}: ${dinheiro(f.valor)} · ${pct.toFixed(0)}% do total`}
                      >
                        <span className="barra-rotulo">{f.rotulo}</span>
                        <span className="barra-trilho">
                          <span
                            className="barra-valor"
                            style={{ width: maiorForma > 0 ? `${(f.valor / maiorForma) * 100}%` : 0 }}
                          />
                        </span>
                        <span className="barra-numero num">{dinheiro(f.valor)}</span>
                        <span className="barra-pct num">{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
                <div className="linha" style={{ marginTop: 14 }}>
                  <span>Sangrias</span><span className="v">− {dinheiro(pagamento.sangrias)}</span>
                </div>
                <div className="linha">
                  <span>Suprimentos</span><span className="v">+ {dinheiro(pagamento.suprimentos)}</span>
                </div>
              </section>

              <section className="cartao">
                <h2>Cancelamentos</h2>
                {cancelamentos.length === 0 ? (
                  <p className="dica">Nenhum cancelamento no período.</p>
                ) : (
                  <div className="tabela-rolagem">
                    <table className="tabela">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Motivo</th>
                          <th>Cancelou</th>
                          <th>Autorizou</th>
                          <th className="dir">Quando</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cancelamentos.map((l) => (
                          <tr key={l.id}>
                            <td>{l.quantidade}× {l.nome_produto}</td>
                            <td className="fraco">{l.motivo_cancelamento}</td>
                            <td>{nome(l.cancelado_por)}</td>
                            <td>{nome(l.autorizado_por)}</td>
                            <td className="dir num">{dataHora(l.cancelado_em)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <section className="cartao">
              <h2>Ranking de produtos</h2>
              {vendas.length === 0 ? (
                <p className="dica">Nada vendido ainda.</p>
              ) : (
                <table className="tabela">
                  <thead>
                    <tr>
                      <th className="estreita">#</th>
                      <th>Produto</th>
                      <th className="dir">Vendidos</th>
                      <th className="dir">Faturado</th>
                      <th>Participação</th>
                      <th className="dir">Cancelados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendas.map((v, i) => {
                      const pct = totalFaturado > 0 ? (Number(v.faturado) / totalFaturado) * 100 : 0;
                      return (
                        <tr key={v.produto_id}>
                          <td className="estreita fraco num">{i + 1}</td>
                          <td>{v.nome_produto}</td>
                          <td className="dir num">{v.vendidos}</td>
                          <td className="dir num">{dinheiro(v.faturado)}</td>
                          <td>
                            <span className="participacao" title={`${pct.toFixed(1)}% do faturado`}>
                              <span className="barra-trilho">
                                <span className="barra-valor" style={{ width: `${pct}%` }} />
                              </span>
                              <span className="num">{pct.toFixed(1)}%</span>
                            </span>
                          </td>
                          <td className="dir num">{v.cancelamentos || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="painel">
      {erro && <p className="aviso-fila">{erro}</p>}

      {chipsModo}

      <section className="cartao">
        {seletorPeriodo}
        {contagemTurnos}
      </section>

      {pronto && pagamento && (
        <>
          <section className="cartao">
            <h2>{tituloPeriodo}</h2>
            <div className="linha"><span>Pix</span><span className="v">{dinheiro(pagamento.pix)}</span></div>
            <div className="linha"><span>Débito</span><span className="v">{dinheiro(pagamento.debito)}</span></div>
            <div className="linha"><span>Crédito</span><span className="v">{dinheiro(pagamento.credito)}</span></div>
            <div className="linha"><span>Dinheiro</span><span className="v">{dinheiro(pagamento.dinheiro)}</span></div>
            <div className="linha"><span>Sangrias</span><span className="v">− {dinheiro(pagamento.sangrias)}</span></div>
            <div className="linha"><span>Suprimentos</span><span className="v">+ {dinheiro(pagamento.suprimentos)}</span></div>
            <div className="soma"><span>Total</span><span className="num">{dinheiro(pagamento.total_recebido)}</span></div>
          </section>

          <section className="cartao">
            <div className="metricas">
              <div className="metrica">
                <span>{labelComandas}</span>
                <strong className="num">{comandas}</strong>
              </div>
              <div className="metrica">
                <span>Ticket médio</span>
                <strong className="num">{dinheiro(ticketMedio)}</strong>
              </div>
            </div>
          </section>

          <section className="cartao">
            <h2>Ranking de produtos</h2>
            {vendas.length === 0 && <p className="dica">Nada vendido ainda.</p>}
            <div className="lista">
              {vendas.map((v) => (
                <div className="linha" key={v.produto_id}>
                  <span><span className="q">{v.vendidos}×</span>{v.nome_produto}</span>
                  <span className="v">{dinheiro(v.faturado)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cartao">
            <h2>Cancelamentos</h2>
            <p className="dica">É o relatório que justifica a regra do dono existir.</p>
            {cancelamentos.length === 0 && <p className="dica">Nenhum cancelamento no período.</p>}
            <div className="lista">
              {cancelamentos.map((l) => (
                <div className="linha-cancelamento" key={l.id}>
                  <div className="linha">
                    <span>{l.quantidade}× {l.nome_produto}</span>
                    <span className="v">{dataHora(l.cancelado_em)}</span>
                  </div>
                  <span className="obs-linha">{l.motivo_cancelamento}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cartao">
            <h2>Exportar</h2>
            <div className="acoes">
              <button className="secundario" onClick={copiarTexto}>
                {copiado ? "Copiado!" : "Copiar texto (WhatsApp)"}
              </button>
              <button className="secundario" onClick={baixarCsv}>Baixar CSV do ranking</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function csv(s: string) {
  return `"${s.replace(/"/g, '""')}"`;
}
