import { useCallback, useEffect, useState } from "react";
import {
  atualizarAtivoPerfil,
  atualizarPapelPerfil,
  buscarEquipe,
  definirPin,
  type Papel,
  type Perfil,
} from "../../lib/api";
import Carregando, { SpinnerBotao } from "../../componentes/Carregando";

const PAPEIS: { id: Papel; rotulo: string }[] = [
  { id: "garcom", rotulo: "Garçom" },
  { id: "gerente", rotulo: "Gerente" },
  { id: "dono", rotulo: "Dono" },
];

export default function Equipe({ perfilAtual }: { perfilAtual: Perfil }) {
  const [equipe, setEquipe] = useState<Perfil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setEquipe(await buscarEquipe());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar a equipe.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => void recarregar(), [recarregar]);

  async function mudarPapel(id: string, papel: Papel) {
    try {
      await atualizarPapelPerfil(id, papel);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível mudar o papel.");
    }
  }

  async function mudarAtivo(id: string, ativo: boolean) {
    try {
      await atualizarAtivoPerfil(id, ativo);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar.");
    }
  }

  if (carregando) return <Carregando texto="Carregando a equipe…" />;

  return (
    <div className="painel">
      {erro && <p className="aviso-fila">{erro}</p>}

      <MeuPin />

      <section className="cartao">
        <h2>Equipe</h2>
        <div className="lista">
          {equipe.map((p) => {
            const souEu = p.id === perfilAtual.id;
            return (
              <div className="linha-equipe" key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
                <div className="info-produto">
                  <span className="nome-produto">{p.nome}{souEu && " (você)"}</span>
                </div>
                <select
                  value={p.papel}
                  disabled={souEu}
                  onChange={(e) => mudarPapel(p.id, e.target.value as Papel)}
                >
                  {PAPEIS.map((pp) => (
                    <option key={pp.id} value={pp.id}>{pp.rotulo}</option>
                  ))}
                </select>
                <button
                  className={p.ativo ? "secundario" : "principal"}
                  disabled={souEu}
                  onClick={() => mudarAtivo(p.id, !p.ativo)}
                >
                  {p.ativo ? "Desativar" : "Reativar"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MeuPin() {
  const [pin, setPin] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setErro(null);
    setSalvo(false);
    if (pin.length < 4) return setErro("PIN precisa de pelo menos 4 dígitos.");
    if (pin !== confirmacao) return setErro("Os PINs não conferem.");

    setEnviando(true);
    try {
      await definirPin(pin);
      setPin("");
      setConfirmacao("");
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o PIN.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao">
      <h2>Meu PIN de autorização</h2>
      <p className="dica">Usado para autorizar cancelamento de item lançado por qualquer garçom.</p>

      <label htmlFor="pin-novo">Novo PIN</label>
      <input
        id="pin-novo"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="••••"
      />

      <label htmlFor="pin-confirma">Confirmar PIN</label>
      <input
        id="pin-confirma"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={confirmacao}
        onChange={(e) => setConfirmacao(e.target.value)}
        placeholder="••••"
      />

      {erro && <p className="erro">{erro}</p>}
      {salvo && <p className="dica" style={{ color: "var(--verde)" }}>PIN atualizado.</p>}

      <div className="acoes">
        <button className="principal" onClick={salvar} disabled={enviando}>
          {enviando && <SpinnerBotao />}
          {enviando ? "Salvando…" : "Salvar PIN"}
        </button>
      </div>
    </section>
  );
}
