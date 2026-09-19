import { abrirComanda, lancarItem, type Lancamento } from "./api";

/**
 * Fila de lançamentos pendentes.
 *
 * O garçom toca no item e a UI já mostra — o envio acontece depois.
 * Como o id do lançamento é gerado aqui (uuid) e a function `lancar_item`
 * é idempotente, reenviar o mesmo item nunca duplica no banco.
 *
 * A comanda em si só é criada no banco quando o PRIMEIRO item de uma mesa
 * é de fato enviado — é por isso que o pendente carrega `mesaId`, não
 * `comandaId`. Enquanto está só na fila (ou offline), nenhuma comanda
 * existe ainda; tocar numa mesa livre e voltar sem lançar nada não deixa
 * rastro nenhum no salão.
 *
 * Fica em localStorage: se o app morrer no meio do salão, os pendentes
 * voltam na próxima abertura.
 */

export type Pendente = {
  id: string;
  mesaId: number;
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
type OuvinteConfirmado = (lancamento: Lancamento, mesaId: number) => void;
type OuvinteErro = (pendente: Pendente) => void;

let fila: Pendente[] = carregar();
let ouvintes: Ouvinte[] = [];
let ouvintesConfirmados: OuvinteConfirmado[] = [];
let ouvintesErro: OuvinteErro[] = [];
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
 * em 0 (o item "sumia" antes do valor confirmado aparecer). Também é
 * assim que a tela descobre o `comanda_id`, já que ele só existe a
 * partir dessa confirmação.
 */
export function assinarConfirmados(o: OuvinteConfirmado) {
  ouvintesConfirmados.push(o);
  return () => {
    ouvintesConfirmados = ouvintesConfirmados.filter((x) => x !== o);
  };
}

/** Avisa quando um pendente é recusado de vez (regra, não rede) —
 *  produto indisponível, comanda fechada etc. Sem isso o item só
 *  sumia da fila em silêncio; o garçom nunca fica sabendo. */
export function assinarErros(o: OuvinteErro) {
  ouvintesErro.push(o);
  return () => {
    ouvintesErro = ouvintesErro.filter((x) => x !== o);
  };
}

export function pendentesDaMesa(mesaId: number) {
  return fila.filter((p) => p.mesaId === mesaId);
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

  // válido só durante essa passada: evita chamar abrir_comanda de novo
  // pra cada item de uma mesa que já ficou "aberta" nesta mesma leva.
  // abrir_comanda é idempotente (devolve a comanda existente), então
  // isso é só economia de round-trip, não uma questão de correção.
  const comandaPorMesa = new Map<number, number>();

  try {
    while (fila.length) {
      const p = fila[0];
      try {
        let comandaId = comandaPorMesa.get(p.mesaId);
        if (comandaId === undefined) {
          comandaId = await abrirComanda(p.mesaId);
          comandaPorMesa.set(p.mesaId, comandaId);
        }
        const confirmado = await lancarItem({
          id: p.id,
          comandaId,
          produtoId: p.produtoId,
          quantidade: p.quantidade,
          observacao: p.observacao,
        });
        fila.shift();
        persistir();
        ouvintesConfirmados.forEach((o) => o(confirmado, p.mesaId));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const semRede =
          !navigator.onLine || /fetch|network|timeout/i.test(msg);

        if (semRede) break; // tenta de novo quando voltar

        // erro de regra (produto indisponível, caixa fechado):
        // não adianta insistir, tira da fila e marca
        p.erro = msg;
        fila.shift();
        persistir();
        ouvintesErro.forEach((o) => o(p));
        console.error("Lançamento recusado:", msg, p);
      }
    }
  } finally {
    rodando = false;
  }
}

window.addEventListener("online", () => void processar());
setInterval(() => void processar(), 5000);
