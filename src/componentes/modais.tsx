import { useState } from "react";
import {
  centavos,
  dinheiro,
  fecharComanda,
  registrarPagamento,
  registrarPagamentoItens,
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
   PIN — cancelar lançamento já gravado (ou tirar pessoa do couvert).
   O dono está a três metros; ele digita o PIN no aparelho do garçom.
   Nada de aprovação assíncrona travando o atendimento.
------------------------------------------------------------------ */
export function ModalPin({
  nomeItem,
  titulo = `Cancelar ${nomeItem}`,
  dica = "O item já foi lançado. Cancelar exige autorização do dono ou gerente — e fica registrado com o nome de quem autorizou.",
  exemploMotivo = "cliente desistiu, item errado…",
  rotuloAcao = "Cancelar item",
  onConfirmar,
  onFechar,
}: {
  nomeItem?: string;
  titulo?: string;
  dica?: string;
  exemploMotivo?: string;
  rotuloAcao?: string;
  onConfirmar: (motivo: string, pin: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setErro(null);
    if (!motivo.trim()) return setErro("Diga o motivo.");
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
        <h3>{titulo}</h3>
        <p className="dica">{dica}</p>

        <label htmlFor="motivo">Motivo</label>
        <input
          id="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={exemploMotivo}
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
            {enviando ? "Enviando…" : rotuloAcao}
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
  itensPagos,
  pessoas: pessoasMesa,
  couvertPorPessoa,
  couvertsPagos,
  onMudou,
  onFechou,
  onFechar,
}: {
  comandaId: number;
  lancamentos: Lancamento[];
  total: number;
  pago: number;
  itensPagos: Set<string>;
  pessoas: number;
  couvertPorPessoa: number;
  couvertsPagos: number;
  onMudou: () => void;
  onFechou: () => void;
  onFechar: () => void;
}) {
  const falta = Math.max(total - pago, 0);
  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [valor, setValor] = useState(() => centavos(falta));
  const [pessoas, setPessoas] = useState(pessoasMesa);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /* pagar por item é opcional: quem sai mais cedo marca o que consumiu
     (quantas linhas de cada produto e quantos couverts) e o valor já vem
     somado. Sem nada marcado, é o pagamento de valor solto de sempre. */
  const [selecao, setSelecao] = useState<Record<string, number>>({});
  const [couvertsSel, setCouvertsSel] = useState(0);

  // mesmo produto com preço diferente (cardápio mudou) fica em linha separada
  const grupos = new Map<
    string,
    { chave: string; nome: string; preco: number; q: number; qPago: number; abertos: Lancamento[] }
  >();
  for (const l of lancamentos) {
    const chave = `${l.produto_id}:${l.preco_unitario}`;
    const g = grupos.get(chave) ?? {
      chave, nome: l.nome_produto, preco: Number(l.preco_unitario), q: 0, qPago: 0, abertos: [],
    };
    g.q += l.quantidade;
    if (itensPagos.has(l.id)) g.qPago += l.quantidade;
    else g.abertos.push(l);
    grupos.set(chave, g);
  }

  const couvert = pessoasMesa * couvertPorPessoa;
  const couvertsAbertos = Math.max(pessoasMesa - couvertsPagos, 0);

  function escolhidos(sel: Record<string, number>) {
    return [...grupos.values()].flatMap((g) => g.abertos.slice(0, sel[g.chave] ?? 0));
  }

  function somaSelecao(sel: Record<string, number>, couv: number) {
    const itens = escolhidos(sel).reduce((s, l) => s + l.quantidade * Number(l.preco_unitario), 0);
    return itens + couv * couvertPorPessoa;
  }

  // marcar/desmarcar já preenche o valor; dá pra editar depois
  function mudarSelecao(sel: Record<string, number>, couv: number) {
    setSelecao(sel);
    setCouvertsSel(couv);
    const soma = somaSelecao(sel, couv);
    setValor(centavos(soma > 0 ? soma : falta));
  }

  function mudarGrupo(chave: string, max: number, delta: number) {
    const n = Math.min(Math.max((selecao[chave] ?? 0) + delta, 0), max);
    mudarSelecao({ ...selecao, [chave]: n }, couvertsSel);
  }

  const somaSel = somaSelecao(selecao, couvertsSel);
  const temSelecao = somaSel > 0;

  async function pagar() {
    setErro(null);
    if (valor <= 0) return setErro("Informe o valor recebido.");

    setEnviando(true);
    try {
      if (temSelecao) {
        await registrarPagamentoItens({
          comandaId,
          forma,
          valor,
          lancamentos: escolhidos(selecao).map((l) => l.id),
          couvertPessoas: couvertsSel,
        });
      } else {
        await registrarPagamento(comandaId, forma, valor);
      }
      onMudou();
      setSelecao({});
      setCouvertsSel(0);
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
        <p className="dica">
          Não cobramos 10% · pagamento pode ser parcial. Quem sai antes: use o + pra marcar o que
          a pessoa consumiu, ou só digite o valor.
        </p>

        {[...grupos.values()].map((g) => {
          const n = selecao[g.chave] ?? 0;
          const qSel = g.abertos.slice(0, n).reduce((s, l) => s + l.quantidade, 0);
          return (
            <div className={"linha linha-conta" + (n > 0 ? " marcada" : "")} key={g.chave}>
              <span className="nome-linha">
                <span className="q">{g.q}×</span>{g.nome}
                {g.qPago > 0 && <span className="pago">{g.qPago} pago</span>}
              </span>
              {g.abertos.length > 0 && (
                <span className="selecao">
                  <button onClick={() => mudarGrupo(g.chave, g.abertos.length, -1)} disabled={n === 0}
                    aria-label={`Desmarcar um ${g.nome}`}>−</button>
                  <b>{qSel}</b>
                  <button onClick={() => mudarGrupo(g.chave, g.abertos.length, 1)} disabled={n >= g.abertos.length}
                    aria-label={`Marcar um ${g.nome} pra pagar`}>+</button>
                </span>
              )}
              <span className="v">{dinheiro(g.q * g.preco)}</span>
            </div>
          );
        })}
        {couvert > 0 && (
          <div className={"linha linha-conta" + (couvertsSel > 0 ? " marcada" : "")}>
            <span className="nome-linha">
              <span className="q">{pessoasMesa}×</span>Couvert
              {couvertsPagos > 0 && <span className="pago">{couvertsPagos} pago</span>}
            </span>
            {couvertsAbertos > 0 && (
              <span className="selecao">
                <button onClick={() => mudarSelecao(selecao, couvertsSel - 1)} disabled={couvertsSel === 0}
                  aria-label="Desmarcar um couvert">−</button>
                <b>{couvertsSel}</b>
                <button onClick={() => mudarSelecao(selecao, couvertsSel + 1)}
                  disabled={couvertsSel >= couvertsAbertos} aria-label="Marcar um couvert pra pagar">+</button>
              </span>
            )}
            <span className="v">{dinheiro(couvert)}</span>
          </div>
        )}
        {temSelecao && (
          <div className="soma" style={{ fontSize: 18, color: "var(--madeira)" }}>
            <span>Marcado</span><span className="num">{dinheiro(somaSel)}</span>
          </div>
        )}

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
