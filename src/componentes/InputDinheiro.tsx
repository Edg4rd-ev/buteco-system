import { useRef, type InputHTMLAttributes } from "react";
import { centavos, dinheiro } from "../lib/api";

// Até R$ 999.999.999,99 — mais que isso é dedo escorregando no teclado.
const MAX_DIGITOS = 11;

type Props = {
  valor: number;
  onChange: (valor: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode">;

/**
 * Campo de valor no jeito de app de banco: começa em "R$ 0,00" e cada dígito
 * digitado entra pela direita (1 → 0,01 → 0,12 → 1,23). Apagar tira o último.
 * O valor sai sempre como número em reais, já arredondado pra centavos.
 */
export default function InputDinheiro({ valor, onChange, onFocus, ...resto }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  // o cursor fica sempre no fim: é lá que os dígitos entram e saem
  const cursorNoFim = () =>
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el && document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length);
    });

  return (
    <input
      {...resto}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={dinheiro(valor)}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
        if (digitos.length > MAX_DIGITOS) return;
        onChange(centavos(Number(digitos || "0") / 100));
        cursorNoFim();
      }}
      onFocus={(e) => {
        cursorNoFim();
        onFocus?.(e);
      }}
      onClick={cursorNoFim}
    />
  );
}
