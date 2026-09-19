import { useCallback, useEffect, useState } from "react";
import { atualizarMesa, buscarMesas, criarMesa, type Mesa } from "../../lib/api";
import Carregando, { SpinnerBotao } from "../../componentes/Carregando";

export default function Mesas() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mesaAberta, setMesaAberta] = useState<Mesa | "nova" | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setMesas(await buscarMesas());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar as mesas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => void recarregar(), [recarregar]);

  if (carregando) return <Carregando texto="Carregando as mesas…" />;

  return (
    <div className="painel">
      {erro && <p className="aviso-fila">{erro}</p>}

      <div className="acoes">
        <button className="principal" onClick={() => setMesaAberta("nova")}>+ Nova mesa</button>
      </div>

      <section className="cartao">
        <h2>Mesas do salão</h2>
        <p className="dica">
          Uma mesa desativada some do salão do garçom, mas continua no histórico —
          nunca é apagada de verdade.
        </p>
        {mesas.length === 0 && <p className="dica">Nenhuma mesa cadastrada ainda.</p>}
        <div className="lista">
          {mesas.map((m) => (
            <div className="linha-produto" key={m.id} style={{ opacity: m.ativa ? 1 : 0.5 }}>
              <div className="info-produto">
                <span className="nome-produto">
                  {m.rotulo === "Balcão" ? m.rotulo : `Mesa ${m.rotulo}`}
                </span>
                <span className="obs-linha">ordem {m.ordem}</span>
              </div>
              <div className="acoes-produto">
                <button
                  aria-pressed={m.ativa}
                  className="chip-toggle"
                  onClick={() => atualizarMesa(m.id, { ativa: !m.ativa }).then(recarregar)}
                >
                  {m.ativa ? "Ativa" : "Desativada"}
                </button>
                <button
                  className="botao-icone"
                  aria-label={`Editar ${m.rotulo}`}
                  onClick={() => setMesaAberta(m)}
                >
                  ✎
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {mesaAberta !== null && (
        <ModalMesa
          mesa={mesaAberta === "nova" ? null : mesaAberta}
          onFechar={() => setMesaAberta(null)}
          onSalvar={async (dados) => {
            if (mesaAberta === "nova") await criarMesa(dados);
            else await atualizarMesa(mesaAberta.id, dados);
            await recarregar();
          }}
        />
      )}
    </div>
  );
}

function ModalMesa({
  mesa,
  onSalvar,
  onFechar,
}: {
  mesa: Mesa | null;
  onSalvar: (dados: { rotulo: string; ordem: number }) => Promise<void>;
  onFechar: () => void;
}) {
  const [rotulo, setRotulo] = useState(mesa?.rotulo ?? "");
  const [ordem, setOrdem] = useState(String(mesa?.ordem ?? 0));
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
