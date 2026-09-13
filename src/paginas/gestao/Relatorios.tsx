import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buscarCancelamentos,
  buscarFechamentoSessao,
  buscarResumoSessao,
  buscarSessoesRecentes,
  buscarVendasProduto,
  dataHora,
  dinheiro,
  type FechamentoSessao,
  type Lancamento,
  type ResumoSessao,
  type SessaoCaixa,
  type VendaProduto,
} from "../../lib/api";
import Carregando from "../../componentes/Carregando";

export default function Relatorios() {
  const [sessoes, setSessoes] = useState<SessaoCaixa[]>([]);
  const [sessaoId, setSessaoId] = useState<number | null>(null);
  const [fechamento, setFechamento] = useState<FechamentoSessao | null>(null);
  const [resumo, setResumo] = useState<ResumoSessao | null>(null);
  const [vendas, setVendas] = useState<VendaProduto[]>([]);
  const [cancelamentos, setCancelamentos] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    buscarSessoesRecentes()
      .then((lista) => {
        setSessoes(lista);
        if (lista.length) setSessaoId(lista[0].id);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao listar turnos."))
      .finally(() => setCarregando(false));
  }, []);

  const carregarSessao = useCallback(async (id: number) => {
    setCarregando(true);
    try {
      const [f, r, v, c] = await Promise.all([
        buscarFechamentoSessao(id),
        buscarResumoSessao(id),
        buscarVendasProduto(id),
        buscarCancelamentos(id),
      ]);
      setFechamento(f);
      setResumo(r);
      setVendas(v);
      setCancelamentos(c);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o relatório.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (sessaoId !== null) void carregarSessao(sessaoId);
  }, [sessaoId, carregarSessao]);

  const sessaoAtual = sessoes.find((s) => s.id === sessaoId) ?? null;

  const ticketMedio = useMemo(() => {
    if (!fechamento || !resumo || resumo.comandas === 0) return 0;
    return Number(fechamento.total_recebido) / resumo.comandas;
  }, [fechamento, resumo]);

  const textoExport = useMemo(() => {
    if (!sessaoAtual || !fechamento || !resumo) return "";
    const linhas = [
      `Buteco Seu Barba — fechamento do turno`,
      `Aberto: ${dataHora(sessaoAtual.aberta_em)}${sessaoAtual.fechada_em ? ` · Fechado: ${dataHora(sessaoAtual.fechada_em)}` : " · em andamento"}`,
      ``,
      `Pix: ${dinheiro(fechamento.pix)}`,
      `Débito: ${dinheiro(fechamento.debito)}`,
      `Crédito: ${dinheiro(fechamento.credito)}`,
      `Dinheiro: ${dinheiro(fechamento.dinheiro)}`,
      `Total recebido: ${dinheiro(fechamento.total_recebido)}`,
      `Sangrias: ${dinheiro(fechamento.sangrias)}`,
      `Suprimentos: ${dinheiro(fechamento.suprimentos)}`,
      ``,
      `Mesas atendidas: ${resumo.comandas}`,
      `Ticket médio: ${dinheiro(ticketMedio)}`,
      `Cancelamentos: ${cancelamentos.length}`,
      ``,
      `Ranking de produtos:`,
      ...vendas.map((v) => `  ${v.vendidos}× ${v.nome_produto} — ${dinheiro(v.faturado)}`),
    ];
    return linhas.join("\n");
  }, [sessaoAtual, fechamento, resumo, ticketMedio, cancelamentos, vendas]);

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
    a.download = `turno-${sessaoId}-vendas.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (carregando && sessoes.length === 0) return <Carregando texto="Carregando relatórios…" />;

  return (
    <div className="painel">
      {erro && <p className="aviso-fila">{erro}</p>}

      <section className="cartao">
        <label htmlFor="sessao-sel">Turno</label>
        <select
          id="sessao-sel"
          value={sessaoId ?? ""}
          onChange={(e) => setSessaoId(Number(e.target.value))}
        >
          {sessoes.map((s) => (
            <option key={s.id} value={s.id}>
              {dataHora(s.aberta_em)} {s.fechada_em ? `→ ${dataHora(s.fechada_em)}` : "· em andamento"}
            </option>
          ))}
        </select>
      </section>

      {fechamento && resumo && (
        <>
          <section className="cartao">
            <h2>Totais por forma de pagamento</h2>
            <div className="linha"><span>Pix</span><span className="v">{dinheiro(fechamento.pix)}</span></div>
            <div className="linha"><span>Débito</span><span className="v">{dinheiro(fechamento.debito)}</span></div>
            <div className="linha"><span>Crédito</span><span className="v">{dinheiro(fechamento.credito)}</span></div>
            <div className="linha"><span>Dinheiro</span><span className="v">{dinheiro(fechamento.dinheiro)}</span></div>
            <div className="soma"><span>Total</span><span className="num">{dinheiro(fechamento.total_recebido)}</span></div>
          </section>

          <section className="cartao">
            <div className="metricas">
              <div className="metrica">
                <span>Mesas atendidas</span>
                <strong className="num">{resumo.comandas}</strong>
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
            {cancelamentos.length === 0 && <p className="dica">Nenhum cancelamento no turno.</p>}
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
