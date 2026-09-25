import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, type Perfil } from "../lib/api";
import Caixa from "./gestao/Caixa";
import Cardapio from "./gestao/Cardapio";
import Mesas from "./gestao/Mesas";
import Relatorios from "./gestao/Relatorios";
import Equipe from "./gestao/Equipe";

const ABAS = [
  { id: "caixa", rotulo: "Caixa", descricao: "Turno, sangria e fechamento" },
  { id: "cardapio", rotulo: "Cardápio", descricao: "Categorias, produtos e preços" },
  { id: "mesas", rotulo: "Mesas", descricao: "Mesas que aparecem no salão" },
  { id: "relatorios", rotulo: "Relatórios", descricao: "Vendas por turno, dia ou mês" },
  { id: "equipe", rotulo: "Equipe", descricao: "Papéis, acesso e PIN" },
] as const;

type Aba = (typeof ABAS)[number]["id"];

export default function Gestao({ perfil }: { perfil: Perfil }) {
  const navegar = useNavigate();
  // a aba fica na URL: recarregar a página no computador não volta pro Caixa
  const [params, setParams] = useSearchParams();
  const aba: Aba = ABAS.find((a) => a.id === params.get("aba"))?.id ?? "caixa";
  const atual = ABAS.find((a) => a.id === aba)!;
  const setAba = (id: Aba) => setParams({ aba: id }, { replace: true });

  return (
    <div className="gestao-app">
      {/* só aparece no desktop (ver estilos.css) */}
      <aside className="lateral">
        <div className="lateral-marca">
          <img src="/marca/logo-seu-barba.svg" alt="Buteco Seu Barba" width={36} height={36} />
          <span>Gestão</span>
        </div>
        <nav className="lateral-nav" aria-label="Seções da gestão">
          {ABAS.map((a) => (
            <button
              key={a.id}
              className="lateral-item"
              aria-current={aba === a.id ? "page" : undefined}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </nav>
        <div className="lateral-rodape">
          <button className="botao-topo" onClick={() => navegar("/")}>Ir pro salão</button>
          <div className="lateral-usuario">
            <span>{perfil.nome}</span>
            <span className="sub">{perfil.papel}</span>
          </div>
          <button className="botao-topo" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </aside>

      <div className="gestao-conteudo">
        {/* só aparece no celular */}
        <div className="topo">
          <div className="dentro">
            <button className="botao-topo" onClick={() => navegar("/")}>Salão</button>
            <h1>
              Gestão
              <span className="sub">{perfil.nome} · {perfil.papel}</span>
            </h1>
            <button className="botao-topo" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
          <nav className="chips" aria-label="Seções da gestão">
            {ABAS.map((a) => (
              <button
                key={a.id}
                className="chip"
                aria-pressed={aba === a.id}
                onClick={() => setAba(a.id)}
              >
                {a.rotulo}
              </button>
            ))}
          </nav>
        </div>

        {/* só aparece no desktop */}
        <header className="cabecalho-desktop">
          <h1>{atual.rotulo}</h1>
          <span className="sub">{atual.descricao}</span>
        </header>

        <main className="gestao">
          {aba === "caixa" && <Caixa />}
          {aba === "cardapio" && <Cardapio />}
          {aba === "mesas" && <Mesas />}
          {aba === "relatorios" && <Relatorios />}
          {aba === "equipe" && <Equipe perfilAtual={perfil} />}
        </main>
      </div>
    </div>
  );
}
