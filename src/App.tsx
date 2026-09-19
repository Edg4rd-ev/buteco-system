import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { buscarPerfil, supabase, type Perfil } from "./lib/api";
import Login from "./paginas/Login";
import Salao from "./paginas/Salao";
import Comanda from "./paginas/Comanda";
import Gestao from "./paginas/Gestao";
import Carregando from "./componentes/Carregando";

function Rotas({ perfil }: { perfil: Perfil }) {
  // key pelo pathname reinicia a animação de entrada a cada troca de tela.
  const location = useLocation();
  return (
    <div key={location.pathname} className="pagina-transicao">
      <Routes location={location}>
        <Route path="/" element={<Salao perfil={perfil} />} />
        <Route path="/mesa/:mesaId" element={<Comanda />} />
        <Route
          path="/gestao"
          element={
            perfil.papel === "dono" || perfil.papel === "gerente"
              ? <Gestao perfil={perfil} />
              : <Navigate to="/" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const carregar = () =>
      buscarPerfil()
        .then(setPerfil)
        .catch(() => setPerfil(null))
        .finally(() => setCarregando(false));

    void carregar();

    const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (!sessao) {
        setPerfil(null);
        setCarregando(false);
      } else {
        setCarregando(true);
        void carregar();
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (carregando) return <Carregando texto="Carregando…" />;
  if (!perfil) return <Login />;

  return (
    <BrowserRouter>
      <Rotas perfil={perfil} />
    </BrowserRouter>
  );
}
