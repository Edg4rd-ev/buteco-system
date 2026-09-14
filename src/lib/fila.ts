import { lancarItem, type Lancamento } from "./api";

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
type OuvinteConfirmado = (lancamento: Lancamento) => void;

let fila: Pendente[] = carregar();
let ouvintes: Ouvinte[] = [];
let ouvintesConfirmados: OuvinteConfirmado[] = [];
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

/**
 * Avisa quando um pendente vira lançamento de verdade no banco.
 * Existe pra tela poder trocar "pendente" por "confirmado" na mesma
 * hora que ele sai da fila — sem isso, entre o `fila.shift()` e o
 * realtime trazer a linha nova, a contagem passava por um instante
 * em 0 (o item "sumia" antes do valor confirmado aparecer).
 */
export function assinarConfirmados(o: OuvinteConfirmado) {
  ouvintesConfirmados.push(o);
  return () => {
    ouvintesConfirmados = ouvintesConfirmados.filter((x) => x !== o);
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
        const confirmado = await lancarItem({
          id: p.id,
          comandaId: p.comandaId,
          produtoId: p.produtoId,
          quantidade: p.quantidade,
          observacao: p.observacao,
        });
        fila.shift();
        persistir();
        ouvintesConfirmados.forEach((o) => o(confirmado));
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
