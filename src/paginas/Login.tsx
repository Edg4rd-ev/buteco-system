import { useState } from "react";
import { supabase } from "../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setErro("E-mail ou senha não conferem.");
    setEnviando(false);
  }

  return (
    <div className="login">
      <h1>Buteco Seu Barba</h1>
      <p className="sub">Comandas do salão</p>

      <label htmlFor="email">E-mail</label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && entrar()}
      />

      <label htmlFor="senha">Senha</label>
      <input
        id="senha"
        type="password"
        autoComplete="current-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && entrar()}
      />

      {erro && <p className="erro" style={{ color: "var(--vermelho)" }}>{erro}</p>}

      <button onClick={entrar} disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </div>
  );
}
