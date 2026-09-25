import { useCallback, useEffect, useMemo, useState } from "react";
import {
  abrirSessaoCaixa,
  alterarTrocoInicial,
  centavos,
  buscarFechamentoSessao,
  buscarMovimentosCaixa,
  buscarSalao,
  buscarSessaoAberta,
  dataHora,
  dinheiro,
  fecharSessaoCaixa,
  registrarMovimentoCaixa,
  supabase,
  type FechamentoSessao,
  type MesaSalao,
  type MovimentoCaixa,
  type SessaoCaixa,
  type TipoMovimento,
} from "../../lib/api";
import Carregando, { SpinnerBotao } from "../../componentes/Carregando";
import InputDinheiro from "../../componentes/InputDinheiro";

export default function Caixa() {
  const [sessao, setSessao] = useState<SessaoCaixa | null>(null);
  const [fechamento, setFechamento] = useState<FechamentoSessao | null>(null);
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([]);
  const [mesas, setMesas] = useState<MesaSalao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const s = await buscarSessaoAberta();
      setSessao(s);
      if (s) {
        const [f, m, sal] = await Promise.all([
          buscarFechamentoSessao(s.id),
          buscarMovimentosCaixa(s.id),
          buscarSalao(),
        ]);
        setFechamento(f);
        setMovimentos(m);
        setMesas(sal);
      }
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o caixa.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
    const canal = supabase
      .channel("gestao-caixa")
      .on("postgres_changes", { event: "*", schema: "public", table: "comandas" }, () => void recarregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, () => void recarregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "movimentos_caixa" }, () => void recarregar())
      .subscribe();
    return () => void supabase.removeChannel(canal);
  }, [recarregar]);

  if (carregando) return <Carregando texto="Carregando o caixa…" />;

  return (
    <div className="painel painel-caixa">
      {erro && <p className="aviso-fila">{erro}</p>}
      {sessao ? (
        <TurnoAberto
          sessao={sessao}
          fechamento={fechamento}
          movimentos={movimentos}
          mesas={mesas}
          onMudou={recarregar}
        />
      ) : (
        <AbrirTurno onAbriu={recarregar} />
      )}
    </div>
  );
}

function AbrirTurno({ onAbriu }: { onAbriu: () => void }) {
  const [troco, setTroco] = useState(100);
  const [evento, setEvento] = useState(false);
  const [couvert, setCouvert] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function abrir() {
    setErro(null);
    if (evento && couvert <= 0) return setErro("Informe o valor do couvert.");

    setEnviando(true);
    try {
      await abrirSessaoCaixa({ troco, evento, couvert: evento ? couvert : 0 });
      onAbriu();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o turno.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao abrir-turno">
      <h2>Abrir turno</h2>
      <p className="dica">Sem turno aberto, ninguém lança item no salão.</p>

      <label htmlFor="troco">Troco inicial</label>
      <InputDinheiro id="troco" valor={troco} onChange={setTroco} />

      <label className="linha-toggle">
        <input type="checkbox" checked={evento} onChange={(e) => setEvento(e.target.checked)} />
        Dia de evento (cobra couvert)
      </label>

      {evento && (
        <>
          <label htmlFor="couvert">Valor do couvert por pessoa</label>
          <InputDinheiro id="couvert" valor={couvert} onChange={setCouvert} />
        </>
      )}

      {erro && <p className="erro">{erro}</p>}

      <div className="acoes">
        <button className="principal" onClick={abrir} disabled={enviando}>
          {enviando && <SpinnerBotao />}
          {enviando ? "Abrindo…" : "Abrir turno"}
        </button>
      </div>
    </section>
  );
}

function TurnoAberto({
  sessao,
  fechamento,
  movimentos,
  mesas,
  onMudou,
}: {
  sessao: SessaoCaixa;
  fechamento: FechamentoSessao | null;
  movimentos: MovimentoCaixa[];
  mesas: MesaSalao[];
  onMudou: () => void;
}) {
  const [modalMovimento, setModalMovimento] = useState<TipoMovimento | null>(null);
  const [fechando, setFechando] = useState(false);
  const [editandoTroco, setEditandoTroco] = useState(false);

  const mesasAbertas = useMemo(() => mesas.filter((m) => m.comanda_id), [mesas]);

  const esperadoEmDinheiro = useMemo(() => {
    if (!fechamento) return sessao.troco_inicial;
    return (
      Number(sessao.troco_inicial) +
      Number(fechamento.dinheiro) -
      Number(fechamento.sangrias) +
      Number(fechamento.suprimentos)
    );
  }, [fechamento, sessao.troco_inicial]);

  return (
    <>
      <section className="cartao">
        <h2>Turno em andamento</h2>
        <div className="linha">
          <span>Aberto em</span>
          <span className="v">{dataHora(sessao.aberta_em)}</span>
        </div>
        <div className="linha">
          <span>Troco inicial</span>
          <span className="v">
            {dinheiro(sessao.troco_inicial)}
            <button className="editar-inline" onClick={() => setEditandoTroco(true)}>editar</button>
          </span>
        </div>
        <div className="linha">
          <span>Dia de evento</span>
          <span className="v">
            {sessao.evento ? `Sim · couvert ${dinheiro(sessao.couvert_valor)}` : "Não"}
          </span>
        </div>
      </section>

      <section className="cartao">
        <h2>Sangria e suprimento</h2>
        <div className="acoes">
          <button className="secundario" onClick={() => setModalMovimento("sangria")}>− Sangria</button>
          <button className="secundario" onClick={() => setModalMovimento("suprimento")}>+ Suprimento</button>
        </div>

        {movimentos.length > 0 && (
          <div className="lista" style={{ marginTop: 14 }}>
            {movimentos.map((m) => (
              <div className="linha" key={m.id}>
                <span>
                  {m.tipo === "sangria" ? "Sangria" : "Suprimento"}
                  {m.motivo && <span className="obs-linha"> — {m.motivo}</span>}
                </span>
                <span className="v">{dinheiro(m.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="cartao fechar-turno">
        <h2>Fechar turno</h2>

        {fechamento && (
          <>
            <div className="linha"><span>Pix</span><span className="v">{dinheiro(fechamento.pix)}</span></div>
            <div className="linha"><span>Débito</span><span className="v">{dinheiro(fechamento.debito)}</span></div>
            <div className="linha"><span>Crédito</span><span className="v">{dinheiro(fechamento.credito)}</span></div>
            <div className="linha"><span>Dinheiro</span><span className="v">{dinheiro(fechamento.dinheiro)}</span></div>
            <div className="linha"><span>Sangrias</span><span className="v">− {dinheiro(fechamento.sangrias)}</span></div>
            <div className="linha"><span>Suprimentos</span><span className="v">+ {dinheiro(fechamento.suprimentos)}</span></div>
            <div className="soma">
              <span>Esperado em dinheiro</span>
              <span className="num">{dinheiro(esperadoEmDinheiro)}</span>
            </div>
          </>
        )}

        {mesasAbertas.length > 0 ? (
          <p className="aviso-bloqueio">
            {mesasAbertas.length} {mesasAbertas.length === 1 ? "mesa trava" : "mesas travam"} o fechamento:{" "}
            {mesasAbertas.map((m) => (m.rotulo === "Balcão" ? "Balcão" : `Mesa ${m.rotulo}`)).join(", ")}
          </p>
        ) : (
          <div className="acoes">
            <button className="principal" onClick={() => setFechando(true)}>
              Conferir e fechar turno
            </button>
          </div>
        )}
      </section>

      {modalMovimento && (
        <ModalMovimento
          tipo={modalMovimento}
          onFechar={() => setModalMovimento(null)}
          onConfirmar={async (valor, motivo) => {
            await registrarMovimentoCaixa(modalMovimento, valor, motivo);
            onMudou();
          }}
        />
      )}

      {fechando && fechamento && (
        <ModalFechamento
          esperado={esperadoEmDinheiro}
          onFechar={() => setFechando(false)}
          onConfirmar={async (valorConferido, observacao) => {
            await fecharSessaoCaixa(valorConferido, observacao);
            onMudou();
          }}
        />
      )}

      {editandoTroco && (
        <ModalEditarTroco
          trocoAtual={sessao.troco_inicial}
          onFechar={() => setEditandoTroco(false)}
          onConfirmar={async (valor, pin) => {
            await alterarTrocoInicial(valor, pin);
            onMudou();
          }}
        />
      )}
    </>
  );
}

function ModalMovimento({
  tipo,
  onConfirmar,
  onFechar,
}: {
  tipo: TipoMovimento;
  onConfirmar: (valor: number, motivo: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [valor, setValor] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setErro(null);
    if (valor <= 0) return setErro("Informe o valor.");
    if (!motivo.trim()) return setErro("Motivo é obrigatório.");

    setEnviando(true);
    try {
      await onConfirmar(valor, motivo.trim());
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="fundo" onClick={onFechar} />
      <div className="caixa">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h3>{tipo === "sangria" ? "Sangria" : "Suprimento"}</h3>
        <p className="dica">
          {tipo === "sangria" ? "Retirada de dinheiro do caixa." : "Entrada extra de dinheiro no caixa."}
          {" "}Motivo obrigatório.
        </p>

        <label htmlFor="valor-mov">Valor</label>
        <InputDinheiro id="valor-mov" valor={valor} onChange={setValor} />

        <label htmlFor="motivo-mov">Motivo</label>
        <input
          id="motivo-mov"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="troco para o posto, compra de gelo…"
        />

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes">
          <button className="secundario" onClick={onFechar}>Voltar</button>
          <button className="principal" onClick={confirmar} disabled={enviando}>
            {enviando && <SpinnerBotao />}
            {enviando ? "Registrando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEditarTroco({
  trocoAtual,
  onConfirmar,
  onFechar,
}: {
  trocoAtual: number;
  onConfirmar: (valor: number, pin: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [valor, setValor] = useState(() => centavos(trocoAtual));
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setErro(null);
    if (!pin.trim()) return setErro("PIN do dono é obrigatório.");

    setEnviando(true);
    try {
      await onConfirmar(valor, pin.trim());
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível alterar o troco.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="fundo" onClick={onFechar} />
      <div className="caixa">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h3>Editar troco inicial</h3>
        <p className="dica">Só o dono autoriza. Peça o PIN dele para confirmar.</p>

        <label htmlFor="novo-troco">Novo troco inicial</label>
        <InputDinheiro id="novo-troco" valor={valor} onChange={setValor} />

        <label htmlFor="pin-troco">PIN do dono</label>
        <input
          id="pin-troco"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes">
          <button className="secundario" onClick={onFechar}>Voltar</button>
          <button className="principal" onClick={confirmar} disabled={enviando}>
            {enviando && <SpinnerBotao />}
            {enviando ? "Salvando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalFechamento({
  esperado,
  onConfirmar,
  onFechar,
}: {
  esperado: number;
  onConfirmar: (valorConferido: number, observacao: string | null) => Promise<void>;
  onFechar: () => void;
}) {
  const [conferido, setConferido] = useState(() => centavos(esperado));
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const diferenca = centavos(conferido - esperado);

  async function confirmar() {
    setErro(null);
    setEnviando(true);
    try {
      await onConfirmar(conferido, observacao.trim() || null);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível fechar o turno.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="fundo" onClick={onFechar} />
      <div className="caixa">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h3>Fechar turno</h3>
        <p className="dica">Confira o dinheiro na gaveta antes de confirmar.</p>

        <div className="soma"><span>Esperado</span><span className="num">{dinheiro(esperado)}</span></div>

        <label htmlFor="conferido">Valor conferido na gaveta</label>
        <InputDinheiro id="conferido" valor={conferido} onChange={setConferido} />

        <div className="linha">
          <span>Diferença</span>
          <span className="v" style={{ color: Math.abs(diferenca) < 0.01 ? undefined : "var(--vermelho)" }}>
            {diferenca >= 0 ? "+" : ""}
            {dinheiro(diferenca)}
          </span>
        </div>

        <label htmlFor="obs-fechamento">Observação (opcional)</label>
        <input id="obs-fechamento" value={observacao} onChange={(e) => setObservacao(e.target.value)} />

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes">
          <button className="secundario" onClick={onFechar}>Voltar</button>
          <button className="perigo" onClick={confirmar} disabled={enviando}>
            {enviando && <SpinnerBotao />}
            {enviando ? "Fechando…" : "Confirmar fechamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
