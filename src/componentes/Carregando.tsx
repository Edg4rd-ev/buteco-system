/** Spinner + texto — substitui os antigos parágrafos estáticos de "Carregando…". */
export default function Carregando({ texto }: { texto: string }) {
  return (
    <p className="carregando">
      <span className="spinner" aria-hidden="true" />
      {texto}
    </p>
  );
}

/** Só o spinner, pra usar dentro de botões em estado de envio. */
export function SpinnerBotao() {
  return <span className="spinner spinner-botao" aria-hidden="true" />;
}
