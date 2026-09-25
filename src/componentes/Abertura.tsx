/**
 * Tela de abertura — a mesma que o index.html mostra antes de o JS carregar
 * (as classes `.abertura*` moram lá). O React segura ela enquanto descobre
 * quem está logado, então o logo não pisca na troca.
 */
export default function Abertura() {
  return (
    <div className="abertura" role="status" aria-label="Carregando">
      <img src="/marca/logo-seu-barba.svg" alt="Buteco Seu Barba" width={168} height={168} />
      <span className="abertura-giro" />
    </div>
  );
}
