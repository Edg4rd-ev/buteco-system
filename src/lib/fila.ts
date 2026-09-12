import { lancarItem } from "./api";

/**
 * Fila de lançamentos pendentes.
 *
 * O garçom toca no item e a UI já mostra — o envio acontece depois.
 * Como o id do lançamento é gerado aqui (uuid) e a function `lancar_item`
 * é idempotente, reenviar o mesmo item nunca duplica no banco.
 *
 * Fica em localStorage: se o app morrer no meio do salão, os pendentes
 * voltam na próxima abertura.
 */

export type Pendente = {
  id: string;
  comandaId: number;
  produtoId: number;
  nomeProduto: string;
  precoUnitario: number;
  quantidade: number;
  observacao: string | null;
  tentativas: number;
  erro?: string;
};

const CHAVE = "buteco:fila";
type Ouvinte = (fila: Pendente[]) => void;

let fila: Pendente[] = carregar();
let ouvintes: Ouvinte[] = [];
let rodando = false;

function carregar(): Pendente[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as Pendente[];
  } catch {
    return [];
  }
}

function persistir() {
  localStorage.setItem(CHAVE, JSON.stringify(fila));
  ouvintes.forEach((o) => o([...fila]));
}

export function assinarFila(o: Ouvinte) {
  ouvintes.push(o);
  o([...fila]);
  return () => {
    ouvintes = ouvintes.filter((x) => x !== o);
  };
}

export function pendentesDaComanda(comandaId: number) {
  return fila.filter((p) => p.comandaId === comandaId);
}

export function enfileirar(item: Omit<Pendente, "tentativas">) {
  fila.push({ ...item, tentativas: 0 });
  persistir();
  void processar();
}

/** Remove um pendente que ainda não subiu — não precisa de PIN:
 *  nada foi gravado no banco ainda. */
export function descartarPendente(id: string) {
  fila = fila.filter((p) => p.id !== id);
  persistir();
}

export async function processar() {
  if (rodando || !navigator.onLine) return;
  rodando = true;

  try {
    while (fila.length) {
      const p = fila[0];
      try {
        await lancarItem({
          id: p.id,
          comandaId: p.comandaId,
          produtoId: p.produtoId,
          quantidade: p.quantidade,
          observacao: p.observacao,
        });
        fila.shift();
        persistir();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const semRede =
          !navigator.onLine || /fetch|network|timeout/i.test(msg);

        if (semRede) break; // tenta de novo quando voltar

        // erro de regra (produto indisponível, comanda fechada):
        // não adianta insistir, tira da fila e marca
        p.erro = msg;
        fila.shift();
        persistir();
        ouvintes.forEach((o) => o([...fila]));
        console.error("Lançamento recusado:", msg, p);
      }
    }
  } finally {
    rodando = false;
  }
}

window.addEventListener("online", () => void processar());
setInterval(() => void processar(), 5000);
