import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type Perfil } from "../lib/api";
import Caixa from "./gestao/Caixa";
import Cardapio from "./gestao/Cardapio";
import Mesas from "./gestao/Mesas";
import Relatorios from "./gestao/Relatorios";
import Equipe from "./gestao/Equipe";

const ABAS = [
  { id: "caixa", rotulo: "Caixa" },
  { id: "cardapio", rotulo: "Cardápio" },
  { id: "mesas", rotulo: "Mesas" },
  { id: "relatorios", rotulo: "Relatórios" },
  { id: "equipe", rotulo: "Equipe" },
] as const;

type Aba = (typeof ABAS)[number]["id"];

export default function Gestao({ perfil }: { perfil: Perfil }) {
  const navegar = useNavigate();
  const [aba, setAba] = useState<Aba>("caixa");

  return (
    <>
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

      <main className="gestao">
        {aba === "caixa" && <Caixa />}
        {aba === "cardapio" && <Cardapio />}
        {aba === "mesas" && <Mesas />}
        {aba === "relatorios" && <Relatorios />}
        {aba === "equipe" && <Equipe perfilAtual={perfil} />}
      </main>
    </>
  );
}
