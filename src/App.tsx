import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { buscarPerfil, supabase, type Perfil } from "./lib/api";
import Login from "./paginas/Login";
import Salao from "./paginas/Salao";
import Comanda from "./paginas/Comanda";
import Gestao from "./paginas/Gestao";

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

  if (carregando) return <p className="carregando">Carregando…</p>;
  if (!perfil) return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Salao perfil={perfil} />} />
        <Route path="/comanda/:id" element={<Comanda />} />
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
    </BrowserRouter>
  );
}
