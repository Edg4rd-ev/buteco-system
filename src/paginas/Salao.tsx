import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  abrirComanda,
  buscarSalao,
  dinheiro,
  sessaoCaixaAberta,
  supabase,
  tempoDesde,
  type MesaSalao,
  type Perfil,
} from "../lib/api";
import Carregando from "../componentes/Carregando";

export default function Salao({ perfil }: { perfil: Perfil }) {
  const navegar = useNavigate();
  const [mesas, setMesas] = useState<MesaSalao[]>([]);
  const [caixaAberto, setCaixaAberto] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const [salao, aberto] = await Promise.all([buscarSalao(), sessaoCaixaAberta()]);
      setMesas(salao);
      setCaixaAberto(aberto);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o salão.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();

    // realtime: o garçom vê a mesa que o colega abriu, o dono vê tudo
    const canal = supabase
      .channel("salao")
      .on("postgres_changes", { event: "*", schema: "public", table: "lancamentos" }, () => void recarregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "comandas" }, () => void recarregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, () => void recarregar())
      .subscribe();

    // só para atualizar o "há quanto tempo"
    const t = setInterval(() => setMesas((m) => [...m]), 60000);

    return () => {
      void supabase.removeChannel(canal);
      clearInterval(t);
    };
  }, [recarregar]);

  async function entrarNaMesa(m: MesaSalao) {
    try {
      const id = m.comanda_id ?? (await abrirComanda(m.mesa_id));
      navegar(`/comanda/${id}?mesa=${encodeURIComponent(m.rotulo)}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a mesa.");
    }
  }

  const abertas = mesas.filter((m) => m.comanda_id).length;
  const noSalao = mesas.reduce((s, m) => s + Number(m.total ?? 0), 0);

  return (
    <>
      <div className="topo">
        <div className="dentro">
          <h1>
            Salão
            <span className="sub">{perfil.nome} · {perfil.papel}</span>
          </h1>
          {(perfil.papel === "dono" || perfil.papel === "gerente") && (
            <button className="botao-topo" onClick={() => navegar("/gestao")}>Gestão</button>
          )}
          <button className="botao-topo" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
        {!caixaAberto && (
          <p className="aviso-fila">
            Caixa fechado — o dono precisa abrir o turno antes de lançar itens.
          </p>
        )}
        {erro && <p className="aviso-fila">{erro}</p>}
      </div>

      <main className="salao">
        <div className="metricas">
          <div className="metrica">
            <span>Mesas abertas</span>
            <strong className="num">{abertas}</strong>
          </div>
          <div className="metrica">
            <span>No salão agora</span>
            <strong className="num">{dinheiro(noSalao)}</strong>
          </div>
        </div>

        {carregando ? (
          <Carregando texto="Carregando o salão…" />
        ) : (
          <div className="mesas">
            {mesas.map((m, i) => {
              const ocupada = !!m.comanda_id;
              return (
                <button
                  key={m.mesa_id}
                  className={"mesa" + (ocupada ? " ocupada" : "")}
                  onClick={() => entrarNaMesa(m)}
                  disabled={!caixaAberto && !ocupada}
                  style={{ animationDelay: `${Math.min(i * 25, 300)}ms` }}
                >
                  <span className="rotulo">
                    {m.rotulo === "Balcão" ? "Balcão" : `Mesa ${m.rotulo}`}
                  </span>
                  <span className="estado">
                    {ocupada
                      ? `${m.itens} ${m.itens === 1 ? "item" : "itens"} · ${tempoDesde(m.aberta_em)}`
                      : "livre"}
                  </span>
                  <span className="valor">{ocupada ? dinheiro(Number(m.total)) : "—"}</span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
