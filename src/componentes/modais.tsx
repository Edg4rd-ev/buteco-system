import { useState } from "react";
import {
  centavos,
  dinheiro,
  fecharComanda,
  registrarPagamento,
  type FormaPagamento,
  type Lancamento,
  type Mesa,
} from "../lib/api";
import { SpinnerBotao } from "./Carregando";
import InputDinheiro from "./InputDinheiro";

/* ------------------------------------------------------------------
   Mesa — cadastrar ou editar mesa do salão (rótulo + ordem). Usado na
   aba Mesas da Gestão e no card "+" do próprio Salão.
------------------------------------------------------------------ */
export function ModalMesa({
  mesa,
  ordemSugerida = 0,
  onSalvar,
  onFechar,
}: {
  mesa: Mesa | null;
  ordemSugerida?: number;
  onSalvar: (dados: { rotulo: string; ordem: number }) => Promise<void>;
  onFechar: () => void;
}) {
  const [rotulo, setRotulo] = useState(mesa?.rotulo ?? "");
  const [ordem, setOrdem] = useState(String(mesa?.ordem ?? ordemSugerida));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setErro(null);
    if (!rotulo.trim()) return setErro("Número ou nome é obrigatório.");
    const o = Number(ordem);
    if (Number.isNaN(o)) return setErro("Ordem precisa ser um número.");

    setEnviando(true);
    try {
      await onSalvar({ rotulo: rotulo.trim(), ordem: o });
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
        <h3>{mesa ? "Editar mesa" : "Nova mesa"}</h3>
        <p className="dica">
          Aparece assim pro garçom no salão — "13" vira "Mesa 13"; "Balcão" ou
          "Varanda" ficam do jeito que você escrever.
        </p>

        <label htmlFor="rotulo-mesa">Número ou nome</label>
        <input
          id="rotulo-mesa"
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
          placeholder="13, Varanda, Área externa…"
          autoFocus
        />

        <label htmlFor="ordem-mesa">Ordem de exibição</label>
        <input
          id="ordem-mesa"
          inputMode="numeric"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value)}
        />

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

/* ------------------------------------------------------------------
   Apelido — rótulo livre da comanda aberta ("da Marcia", "aniversário"),
   só pra esse atendimento. Não mexe no número físico da mesa.
------------------------------------------------------------------ */
export function ModalApelido({
  apelidoAtual,
  onConfirmar,
  onFechar,
}: {
  apelidoAtual: string | null;
  onConfirmar: (apelido: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [valor, setValor] = useState(apelidoAtual ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setErro(null);
    setEnviando(true);
    try {
      await onConfirmar(valor.trim());
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
        <h3>Nome da mesa</h3>
        <p className="dica">
          Só pra esse atendimento — some quando a conta fechar. Não muda o número da mesa.
        </p>

        <label htmlFor="apelido">Nome (opcional)</label>
        <input
          id="apelido"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="da Márcia, aniversário…"
          maxLength={40}
          autoFocus
        />

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

/* ------------------------------------------------------------------
   PIN — cancelar lançamento já gravado.
   O dono está a três metros; ele digita o PIN no aparelho do garçom.
   Nada de aprovação assíncrona travando o atendimento.
------------------------------------------------------------------ */
export function ModalPin({
  nomeItem,
  onConfirmar,
  onFechar,
}: {
  nomeItem: string;
  onConfirmar: (motivo: string, pin: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setErro(null);
    if (!motivo.trim()) return setErro("Diga o motivo do cancelamento.");
    if (!pin.trim()) return setErro("Falta o PIN de autorização.");

    setEnviando(true);
    try {
      await onConfirmar(motivo.trim(), pin);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível cancelar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="fundo" onClick={onFechar} />
      <div className="caixa">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h3>Cancelar {nomeItem}</h3>
        <p className="dica">
          O item já foi lançado. Cancelar exige autorização do dono ou gerente —
          e fica registrado com o nome de quem autorizou.
        </p>

        <label htmlFor="motivo">Motivo</label>
        <input
          id="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="cliente desistiu, item errado…"
        />

        <label htmlFor="pin">PIN do dono ou gerente</label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
        />

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes">
          <button className="secundario" onClick={onFechar}>Voltar</button>
          <button className="perigo" onClick={confirmar} disabled={enviando}>
            {enviando && <SpinnerBotao />}
            {enviando ? "Cancelando…" : "Cancelar item"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Conta — aceita pagamento parcial: quem sai antes paga a parte dele
   e a mesa continua aberta.
------------------------------------------------------------------ */
const FORMAS: { id: FormaPagamento; rotulo: string }[] = [
  { id: "pix", rotulo: "Pix" },
  { id: "debito", rotulo: "Débito" },
  { id: "credito", rotulo: "Crédito" },
  { id: "dinheiro", rotulo: "Dinheiro" },
];

export function ModalConta({
  comandaId,
  lancamentos,
  total,
  pago,
  onMudou,
  onFechou,
  onFechar,
}: {
  comandaId: number;
  lancamentos: Lancamento[];
  total: number;
  pago: number;
  onMudou: () => void;
  onFechou: () => void;
  onFechar: () => void;
}) {
  const falta = Math.max(total - pago, 0);
  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [valor, setValor] = useState(() => centavos(falta));
  const [pessoas, setPessoas] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const agrupado = new Map<string, { nome: string; q: number; v: number }>();
  for (const l of lancamentos) {
    const a = agrupado.get(l.nome_produto) ?? { nome: l.nome_produto, q: 0, v: 0 };
    a.q += l.quantidade;
    a.v += l.quantidade * Number(l.preco_unitario);
    agrupado.set(l.nome_produto, a);
  }

  async function pagar() {
    setErro(null);
    if (valor <= 0) return setErro("Informe o valor recebido.");

    setEnviando(true);
    try {
      await registrarPagamento(comandaId, forma, valor);
      onMudou();
      setValor(0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setEnviando(false);
    }
  }

  async function encerrar() {
    setErro(null);
    setEnviando(true);
    try {
      await fecharComanda(comandaId);
      onFechou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível fechar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="fundo" onClick={onFechar} />
      <div className="caixa">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h3>Conta da mesa</h3>
        <p className="dica">Não cobramos 10% · pagamento pode ser parcial</p>

        {[...agrupado.values()].map((a) => (
          <div className="linha" key={a.nome}>
            <span><span className="q">{a.q}×</span>{a.nome}</span>
            <span className="v">{dinheiro(a.v)}</span>
          </div>
        ))}

        <div className="soma"><span>Total</span><span className="num">{dinheiro(total)}</span></div>
        {pago > 0 && (
          <div className="soma" style={{ fontSize: 18, color: "var(--tinta-fraca)" }}>
            <span>Já pago</span><span className="num">{dinheiro(pago)}</span>
          </div>
        )}
        <div className="soma" style={{ fontSize: 20, color: "var(--madeira)" }}>
          <span>Falta</span><span className="num">{dinheiro(falta)}</span>
        </div>

        <label>Dividir por {pessoas} → {dinheiro(falta / pessoas)} cada</label>
        <div className="formas">
          <button onClick={() => setPessoas(Math.max(1, pessoas - 1))}>−</button>
          <button disabled style={{ opacity: 1 }}>{pessoas}</button>
          <button onClick={() => setPessoas(pessoas + 1)}>+</button>
          <button onClick={() => setValor(centavos(falta / pessoas))}>usar</button>
        </div>

        <label htmlFor="valor">Valor recebido</label>
        <InputDinheiro id="valor" valor={valor} onChange={setValor} />

        <div className="formas">
          {FORMAS.map((f) => (
            <button
              key={f.id}
              aria-pressed={forma === f.id}
              onClick={() => setForma(f.id)}
            >
              {f.rotulo}
            </button>
          ))}
        </div>

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes">
          <button className="secundario" onClick={pagar} disabled={enviando}>
            {enviando && <SpinnerBotao />}
            Registrar pagamento
          </button>
          <button
            className="principal"
            onClick={encerrar}
            disabled={enviando || falta > 0.009}
            title={falta > 0.009 ? "Registre o pagamento do valor que falta antes de encerrar" : undefined}
          >
            {enviando && <SpinnerBotao />}
            Encerrar mesa
          </button>
        </div>
      </div>
    </div>
  );
}
