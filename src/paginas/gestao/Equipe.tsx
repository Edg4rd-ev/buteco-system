import { useCallback, useEffect, useState } from "react";
import {
  atualizarUsuario,
  buscarEquipe,
  criarUsuario,
  definirPin,
  redefinirSenhaUsuario,
  trocarMinhaSenha,
  usuarioDoEmail,
  type Papel,
  type Perfil,
} from "../../lib/api";
import Carregando, { SpinnerBotao } from "../../componentes/Carregando";

const PAPEIS: { id: Papel; rotulo: string }[] = [
  { id: "garcom", rotulo: "Garçom" },
  { id: "gerente", rotulo: "Gerente" },
  { id: "dono", rotulo: "Dono" },
];

const SENHA_MINIMA = 6;

export default function Equipe({ perfilAtual }: { perfilAtual: Perfil }) {
  // cadastrar, mudar papel, desativar e redefinir senha de outros: só o
  // dono (a Edge Function confere de novo). Gerente vê só a própria conta.
  const souDono = perfilAtual.papel === "dono";

  const [equipe, setEquipe] = useState<Perfil[]>([]);
  const [carregando, setCarregando] = useState(souDono);
  const [erro, setErro] = useState<string | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [senhaDe, setSenhaDe] = useState<Perfil | null>(null);

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

  useEffect(() => {
    if (souDono) void recarregar();
  }, [souDono, recarregar]);

  async function atualizar(id: string, dados: { papel?: Papel; ativo?: boolean }) {
    setErro(null);
    setMexendo(id);
    try {
      await atualizarUsuario(id, dados);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      setMexendo(null);
    }
  }

  if (carregando) return <Carregando texto="Carregando a equipe…" />;

  return (
    <div className={"painel painel-equipe" + (souDono ? "" : " so-conta")}>
      {erro && <p className="aviso-fila">{erro}</p>}

      <div className="coluna-conta meu-pin">
        <MinhaSenha />
        <MeuPin />
      </div>

      {souDono && (
        <section className="cartao">
          <div className="cabecalho-cartao">
            <h2>Equipe</h2>
            <button className="botao-topo" onClick={() => setNovoAberto(true)}>+ Novo usuário</button>
          </div>
          <p className="dica">
            Desativar bloqueia o login na hora, mas mantém o nome no histórico das comandas.
          </p>
          <div className="lista">
            {equipe.map((p) => {
              const souEu = p.id === perfilAtual.id;
              return (
                <div className="linha-equipe" key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
                  <div className="info-produto">
                    <span className="nome-produto">{p.nome}{souEu && " (você)"}</span>
                    <span className="obs-linha">
                      {p.email ? `usuário: ${usuarioDoEmail(p.email)}` : "sem login"}
                      {!p.ativo && " · desativado"}
                    </span>
                  </div>
                  <div className="controles-equipe">
                    {mexendo === p.id && <span className="spinner" aria-label="Salvando" />}
                    <select
                      aria-label={`Papel de ${p.nome}`}
                      value={p.papel}
                      disabled={souEu || mexendo !== null}
                      onChange={(e) => atualizar(p.id, { papel: e.target.value as Papel })}
                    >
                      {PAPEIS.map((pp) => (
                        <option key={pp.id} value={pp.id}>{pp.rotulo}</option>
                      ))}
                    </select>
                    <button
                      className="secundario"
                      disabled={!p.email || mexendo !== null}
                      onClick={() => setSenhaDe(p)}
                    >
                      Senha
                    </button>
                    <button
                      className={p.ativo ? "secundario" : "principal"}
                      disabled={souEu || mexendo !== null}
                      onClick={() => atualizar(p.id, { ativo: !p.ativo })}
                    >
                      {p.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {novoAberto && (
        <ModalNovoUsuario
          onFechar={() => setNovoAberto(false)}
          onCriar={async (dados) => {
            await criarUsuario(dados);
            await recarregar();
          }}
        />
      )}

      {senhaDe && (
        <ModalRedefinirSenha
          pessoa={senhaDe}
          onFechar={() => setSenhaDe(null)}
          onConfirmar={(senha) => redefinirSenhaUsuario(senhaDe.id, senha)}
        />
      )}
    </div>
  );
}

function MinhaSenha() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setErro(null);
    setSalvo(false);
    if (!atual) return setErro("Informe a senha atual.");
    if (nova.length < SENHA_MINIMA) return setErro(`A senha nova precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
    if (nova !== confirmacao) return setErro("As senhas novas não conferem.");

    setEnviando(true);
    try {
      await trocarMinhaSenha(atual, nova);
      setAtual("");
      setNova("");
      setConfirmacao("");
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível trocar a senha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao">
      <h2>Minha senha</h2>
      <p className="dica">A senha que você usa pra entrar no sistema.</p>

      <label htmlFor="senha-atual">Senha atual</label>
      <input
        id="senha-atual"
        type="password"
        autoComplete="current-password"
        value={atual}
        onChange={(e) => setAtual(e.target.value)}
      />

      <label htmlFor="senha-nova">Senha nova</label>
      <input
        id="senha-nova"
        type="password"
        autoComplete="new-password"
        value={nova}
        onChange={(e) => setNova(e.target.value)}
      />

      <label htmlFor="senha-confirma">Confirmar senha nova</label>
      <input
        id="senha-confirma"
        type="password"
        autoComplete="new-password"
        value={confirmacao}
        onChange={(e) => setConfirmacao(e.target.value)}
      />

      {erro && <p className="erro">{erro}</p>}
      {salvo && <p className="dica" style={{ color: "var(--verde)" }}>Senha trocada.</p>}

      <div className="acoes">
        <button className="principal" onClick={salvar} disabled={enviando}>
          {enviando && <SpinnerBotao />}
          {enviando ? "Salvando…" : "Trocar senha"}
        </button>
      </div>
    </section>
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

function ModalNovoUsuario({
  onCriar,
  onFechar,
}: {
  onCriar: (dados: { usuario: string; nome: string; senha: string; papel: Papel }) => Promise<void>;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<Papel>("garcom");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // sugere o usuário a partir do primeiro nome, enquanto o dono não mexer nele
  const [usuarioEditado, setUsuarioEditado] = useState(false);
  const sugestao = nome
    .trim()
    .split(/\s+/)[0]
    ?.normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "") ?? "";
  const usuarioFinal = usuarioEditado ? usuario : sugestao;

  async function criar() {
    setErro(null);
    if (!nome.trim()) return setErro("Informe o nome.");
    if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(usuarioFinal)) {
      return setErro("Usuário: de 2 a 30 letras ou números, sem espaço nem acento.");
    }
    if (senha.length < SENHA_MINIMA) return setErro(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);

    setEnviando(true);
    try {
      await onCriar({ usuario: usuarioFinal, nome: nome.trim(), senha, papel });
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o usuário.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="fundo" onClick={onFechar} />
      <div className="caixa">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h3>Novo usuário</h3>
        <p className="dica">Anote o usuário e a senha e passe pra pessoa — ela entra com eles.</p>

        <label htmlFor="novo-nome">Nome</label>
        <input id="novo-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Carlos Souza" />

        <label htmlFor="novo-usuario">Usuário (pra entrar no sistema)</label>
        <input
          id="novo-usuario"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={usuarioFinal}
          onChange={(e) => {
            setUsuarioEditado(true);
            setUsuario(e.target.value.toLowerCase().replace(/\s/g, ""));
          }}
          placeholder="carlos"
        />

        <label htmlFor="novo-senha">Senha inicial</label>
        <input
          id="novo-senha"
          type="text"
          autoComplete="off"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder={`mínimo ${SENHA_MINIMA} caracteres`}
        />

        <label htmlFor="novo-papel">Papel</label>
        <select id="novo-papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
          {PAPEIS.map((p) => (
            <option key={p.id} value={p.id}>{p.rotulo}</option>
          ))}
        </select>

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes">
          <button className="secundario" onClick={onFechar}>Voltar</button>
          <button className="principal" onClick={criar} disabled={enviando}>
            {enviando && <SpinnerBotao />}
            {enviando ? "Criando…" : "Criar usuário"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalRedefinirSenha({
  pessoa,
  onConfirmar,
  onFechar,
}: {
  pessoa: Perfil;
  onConfirmar: (senha: string) => Promise<unknown>;
  onFechar: () => void;
}) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setErro(null);
    if (senha.length < SENHA_MINIMA) return setErro(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);

    setEnviando(true);
    try {
      await onConfirmar(senha);
      setFeito(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível redefinir a senha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="fundo" onClick={onFechar} />
      <div className="caixa">
        <button className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        <h3>Nova senha de {pessoa.nome}</h3>
        <p className="dica">
          Usuário: <strong>{usuarioDoEmail(pessoa.email)}</strong>. A senha antiga para de funcionar na hora.
        </p>

        {feito ? (
          <>
            <p className="dica" style={{ color: "var(--verde)" }}>
              Senha trocada. Passe pra {pessoa.nome}: <strong>{senha}</strong>
            </p>
            <div className="acoes">
              <button className="principal" onClick={onFechar}>Pronto</button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="redefinir-senha">Senha nova</label>
            <input
              id="redefinir-senha"
              type="text"
              autoComplete="off"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={`mínimo ${SENHA_MINIMA} caracteres`}
            />

            {erro && <p className="erro">{erro}</p>}

            <div className="acoes">
              <button className="secundario" onClick={onFechar}>Voltar</button>
              <button className="principal" onClick={confirmar} disabled={enviando}>
                {enviando && <SpinnerBotao />}
                {enviando ? "Salvando…" : "Trocar senha"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
