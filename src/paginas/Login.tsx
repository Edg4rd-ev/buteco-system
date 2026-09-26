import { useState } from "react";
import { emailDoUsuario, supabase } from "../lib/api";
import { SpinnerBotao } from "../componentes/Carregando";

export default function Login() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    setErro(null);
    if (!usuario.trim()) return setErro("Informe o usuário.");
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailDoUsuario(usuario),
      password: senha,
    });
    if (error) {
      setErro(
        /banned/i.test(error.message)
          ? "Esse acesso foi desativado. Fale com o dono."
          : "Usuário ou senha não conferem.",
      );
    }
    setEnviando(false);
  }

  return (
    <div className="login">
      <img className="login-logo" src="/marca/logo-seu-barba.svg" alt="Buteco Seu Barba" width={128} height={128} />
      <p className="sub">Comandas do salão</p>

      <label htmlFor="usuario">Usuário</label>
      <input
        id="usuario"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={usuario}
        onChange={(e) => setUsuario(e.target.value)}
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
        {enviando && <SpinnerBotao />}
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </div>
  );
}
