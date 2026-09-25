import { useEffect, useState } from "react";

// Mesmo corte do CSS (estilos.css, bloco "desktop"). Abaixo disso a tela é a
// do celular, que é a de referência — o desktop só reorganiza o espaço.
const CONSULTA_DESKTOP = "(min-width: 1024px)";

export function useDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(CONSULTA_DESKTOP).matches);

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA_DESKTOP);
    const mudou = () => setDesktop(mq.matches);
    mq.addEventListener("change", mudou);
    return () => mq.removeEventListener("change", mudou);
  }, []);

  return desktop;
}
