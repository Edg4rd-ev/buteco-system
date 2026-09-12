# Buteco Seu Barba — comandas

Sistema de comandas para bar. Esta entrega tem o **schema completo** e a
**tela do garçom** funcionando. As telas de gestão e de produção entram depois,
em cima do mesmo banco.

## O que já funciona

- Login por e-mail/senha (Supabase Auth), perfil com papel (dono / gerente / garçom)
- Salão em tempo real: mesas livres, ocupadas, total parcial, tempo de abertura
- Comanda: busca, navegação por seção, lançamento com um toque
- **Lançamento otimista com fila local** — o item aparece na hora e sobe depois;
  wi-fi caindo não trava o garçom e reenvio não duplica (id uuid + function idempotente)
- **Cancelamento exige PIN** do dono/gerente + motivo, e fica registrado
- Item na fila (ainda não gravado) pode ser descartado sem PIN — nada foi para o banco
- Produto marcado como "acabou" some da tela de todos na hora
- Conta com pagamento parcial e por forma (Pix, débito, crédito, dinheiro)

## Rodando

### 1. Banco

**Opção A — Supabase local (recomendado para teste)**

Precisa de Docker e da CLI:

```bash
npm install -g supabase       # ou brew install supabase/tap/supabase
supabase start
```

As migrations em `supabase/migrations/` são aplicadas sozinhas no `start`.
Ao final, a CLI imprime a `API URL` e a `anon key`.

**Opção B — projeto na nuvem**

Crie o projeto no supabase.com e rode o conteúdo das duas migrations
no SQL Editor, na ordem.

### 2. Variáveis

```bash
cp .env.example .env
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

### 3. App

```bash
npm install
npm run dev
```

## Preparando os dados de teste

Ainda não existe tela de gestão, então o primeiro dono e o primeiro turno
saem pelo SQL Editor (ou pelo Studio local em http://127.0.0.1:54323).

**1. Crie dois usuários** em Authentication → Users:
`dono@buteco.local` e `garcom@buteco.local`, ambos com senha à sua escolha.
O trigger cria o perfil automaticamente, como `garcom`.

**2. Promova o dono e dê um PIN a ele:**

```sql
update perfis
   set papel = 'dono',
       pin_hash = crypt('1234', gen_salt('bf'))
 where id = (select id from auth.users where email = 'dono@buteco.local');
```

**3. Abra o turno** (sem caixa aberto o garçom não consegue lançar — é de propósito):

```sql
insert into sessoes_caixa (aberta_por, troco_inicial, evento, couvert_valor)
values ((select id from perfis where papel = 'dono'), 100, false, 0);
```

Entre como `garcom@buteco.local`, toque numa mesa e comece a lançar.
Para testar o cancelamento, use o PIN `1234`.

## Testes que valem a pena fazer

| Teste | Como | Esperado |
|---|---|---|
| Idempotência | DevTools → Network → Offline, lance 3 itens, volte online | Sobem uma vez só |
| Fila persistente | Offline, lance itens, recarregue a página | Pendentes continuam lá |
| PIN errado | Cancelar um item com PIN `0000` | "PIN inválido", nada muda |
| Preço congelado | Lance um item, mude o preço do produto no Studio, veja a comanda | Comanda mantém o preço antigo |
| Realtime | Duas abas, garçom em cada uma, na mesma mesa | Lançamento aparece nas duas |
| Item esgotado | `select alternar_disponibilidade(7, false);` como dono | Some da tela na hora |

## Estrutura

```
supabase/migrations/   schema, functions, RLS e seed do cardápio
src/lib/api.ts         cliente, tipos e wrappers das RPCs
src/lib/fila.ts        fila offline de lançamentos
src/paginas/           Login, Salao, Comanda
src/componentes/       modais de PIN e de conta
```

## Decisões que valem lembrar

- **Nenhuma escrita direta em tabela de operação.** `revoke insert/update/delete`
  em `comandas`, `lancamentos`, `pagamentos` e caixa. Tudo passa por function
  `security definer`. O app não consegue burlar a regra nem por engano.
- **Views com `security_invoker = true`.** Sem isso a view roda como dona
  da tabela e ignora RLS.
- **Cancelamento guarda dois ids:** quem cancelou (garçom) e quem autorizou (PIN).
  É daí que sai o relatório de cancelamentos por garçom.
- **Couvert congela na abertura da comanda.** Ligar o modo evento às 22h não
  cobra retroativo de quem chegou às 20h.

## Próximos passos

- Tela de gestão: cardápio, preços, disponibilidade, abertura/fechamento de caixa,
  sangria e suprimento, relatório do turno
- Tela de produção (chapa/cozinha) consumindo `v_producao`
- Transferir e juntar mesas na UI (a function `transferir_lancamentos` já existe)
- Reabrir comanda fechada — precisa de function própria com PIN, ainda não existe
- Backup: export do turno no fechamento
