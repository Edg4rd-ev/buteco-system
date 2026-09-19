import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buscarSalao,
  criarMesa,
  dinheiro,
  sessaoCaixaAberta,
  supabase,
  tempoDesde,
  type MesaSalao,
  type Perfil,
} from "../lib/api";
import Carregando from "../componentes/Carregando";
import { ModalMesa } from "../componentes/modais";

export default function Salao({ perfil }: { perfil: Perfil }) {
  const navegar = useNavigate();
  const souGestor = perfil.papel === "dono" || perfil.papel === "gerente";
  const [mesas, setMesas] = useState<MesaSalao[]>([]);
  const [caixaAberto, setCaixaAberto] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novaMesaAberta, setNovaMesaAberta] = useState(false);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "mesas" }, () => void recarregar())
      .subscribe();

    // só para atualizar o "há quanto tempo"
    const t = setInterval(() => setMesas((m) => [...m]), 60000);

    return () => {
      void supabase.removeChannel(canal);
      clearInterval(t);
    };
  }, [recarregar]);

  function entrarNaMesa(m: MesaSalao) {
    // não cria comanda nenhuma aqui — só navega. A comanda só nasce no
    // banco quando o primeiro item é de fato lançado (ver src/lib/fila.ts).
    // Tocou e voltou sem lançar nada: não sobra rastro nenhum no salão.
    navegar(`/mesa/${m.mesa_id}?mesa=${encodeURIComponent(m.rotulo)}`);
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
          {souGestor && (
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
                      ? `${m.apelido ? `${m.apelido} · ` : ""}${m.itens} ${m.itens === 1 ? "item" : "itens"} · ${tempoDesde(m.aberta_em)}`
                      : "livre"}
                  </span>
                  <span className="valor">{ocupada ? dinheiro(Number(m.total)) : "—"}</span>
                </button>
              );
            })}
            {souGestor && (
              <button
                className="mesa nova"
                onClick={() => setNovaMesaAberta(true)}
                style={{ animationDelay: `${Math.min(mesas.length * 25, 300)}ms` }}
              >
                <span className="mais">+</span>
                <span className="rotulo-nova">Nova mesa</span>
              </button>
            )}
          </div>
        )}
      </main>

      {novaMesaAberta && (
        <ModalMesa
          mesa={null}
          ordemSugerida={mesas.reduce((max, m) => Math.max(max, m.ordem), 0) + 1}
          onFechar={() => setNovaMesaAberta(false)}
          onSalvar={async (dados) => {
            await criarMesa(dados);
            await recarregar();
          }}
        />
      )}
    </>
  );
}
