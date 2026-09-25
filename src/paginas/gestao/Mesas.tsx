import { useCallback, useEffect, useState } from "react";
import { atualizarMesa, buscarMesas, criarMesa, type Mesa } from "../../lib/api";
import Carregando from "../../componentes/Carregando";
import { ModalMesa } from "../../componentes/modais";

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
    <div className="painel painel-mesas">
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
        <div className="lista lista-mesas">
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
