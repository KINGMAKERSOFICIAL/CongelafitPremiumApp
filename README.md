# CongelaFit Premium

App web (PWA) para organizar marmitas congeladas: **Meu Freezer** com validade, **Planner** da semana, **Lista de compras** automática e **506 receitas** (396 low carb, 19 de café da manhã para congelar, 30 de almoço para congelar, 16 lanches para congelar, 22 lanches para levar no trabalho, 18 doces saudáveis e 5 marinadas rápidas) com foto, calorias e modo de preparo. Funciona offline e pode ser instalado na tela inicial do celular.

Site: [congelafit.store](https://congelafit.store)

## O que tem

| Tela | O que faz |
| --- | --- |
| **Início** | Painel do dia: o que consumir primeiro no freezer, cardápio de hoje, itens que faltam comprar e sugestões de receitas. |
| **Receitas** | As 506 receitas em 25 categorias (inclui **Café da Manhã para Congelar**, **Almoço para Congelar**, **Molhos, Marinadas e Temperos para Congelar**, **Lanches para Congelar**, **Lanches para Levar no Trabalho**, **Marinadas Rápidas e Saudáveis** e **Doces Saudáveis e Funcionais**, com validade, congelamento e reaquecimento próprios de cada receita), busca, favoritas, ajuste de porções (½×, 2×, 3×), tela sempre acesa. Cada receita tem os botões **Congelar**, **Planejar** e **Lista de compras**, além de um cartão com o prazo de congelamento. |
| **Meu Freezer** | Registro do que foi congelado, validade calculada por categoria (ajustável), ordem PEPS (o que vence primeiro sai primeiro), alertas de "consumir logo" e "passou do prazo", botões "Comi 1" e "+1", compartilhar lista e **etiqueta imprimível** (2 por linha na A4). |
| **Planner** | Semana de segunda a domingo com café, almoço, lanche e jantar. **Montar cardápio** sugere receitas (equilibrado, leve ou rápido), sem repetir na semana e priorizando as favoritas, preenchendo só as refeições vazias. Calorias estimadas por dia e compartilhamento. |
| **Compras** | Soma os ingredientes das receitas (só entre unidades iguais), agrupa por seção do mercado, aceita itens digitados e marca o que já foi comprado. |
| **Guias** | Congelar com segurança, descongelar e reaquecer, validade por categoria (com fontes), embalagens e porcionamento, rotina de marmitas da semana e o que não vai bem no freezer. |
| **Mais** | Favoritas, busca, **backup** (salvar, restaurar e apagar dados) e sobre o app. |

## O que **não** tem (ainda)

- Planos Básico/Pro e banco de dados externo (Supabase). O login, o controle de acesso e o webhook da Kiwify existem (ver "Acesso pela Kiwify" abaixo).

Todos os dados do usuário ficam **só no aparelho** (`localStorage`). Para trocar de celular, use **Mais → Backup**.

## Acesso pela Kiwify (servidor Express)

O login e o webhook rodam no servidor (`server.ts`); o GitHub Pages sozinho não roda isso. Para publicar: `npm ci && npm run build && NODE_ENV=production npm start` (Node 22+).

**Webhook:** `POST /api/webhooks/kiwify/<token-da-url>` (o token da URL está em Admin → Webhook Kiwify). Cadastre essa URL na Kiwify (Apps → Webhooks, produto do app) com todos os eventos de compra e assinatura.

| Variável de ambiente | Para que serve |
| --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Conta do administrador criada na primeira execução. **Sem `ADMIN_PASSWORD` o servidor gera uma senha aleatória e mostra uma vez no log.** |
| `SESSION_SECRET` | Chave das sessões (mínimo 16 caracteres). |
| `KIWIFY_SIGNING_TOKEN` | "Token" do webhook mostrado na Kiwify. Com ele o servidor confere a assinatura HMAC-SHA1 enviada em `?signature=`. Recomendado. |
| `KIWIFY_WEBHOOK_TOKEN` | Segredo que vai no final da URL do webhook (se vazio, é gerado e aparece no Admin). |
| `KIWIFY_PRODUCT_IDS` | IDs de produto da Kiwify (separados por vírgula) que liberam o app. Vazio = todo evento recebido nesse webhook. |
| `ACCESS_DAYS` | Dias de acesso por compra aprovada em produto de pagamento único (padrão 365). |
| `DATA_DIR` | Pasta do banco (`db.json`) e dos uploads. **Em hospedagem com disco efêmero, aponte para um volume persistente.** |

**Regras de acesso:**

- Compra aprovada / renovação: libera por `ACCESS_DAYS` dias a partir da aprovação (comprar de novo antes do fim soma ao que sobra). Em assinatura, vale o `access_until` enviado pela Kiwify.
- Cancelamento: registra e **mantém o acesso até o fim do período pago**.
- Reembolso ou chargeback: remove o acesso na hora; o cadastro e o histórico ficam.
- Pagamento recusado / assinatura atrasada: não derruba quem já pagou e não libera acesso novo.
- Pix/boleto gerado: cria o membro como pendente, sem acesso.
- O mesmo evento repetido (a Kiwify reenvia) é ignorado: deduplicação por `order_id` + tipo de evento.
- Contas criadas antes desta regra não têm prazo e seguem ativas até o admin ou um evento mudar.

## Validade no freezer: estimativas a validar

Os prazos são de **qualidade** (sabor e textura) a −18 °C, não de segurança. Para cada categoria foi usado o **menor limite superior** entre as tabelas do USDA FSIS, do FoodSafety.gov e de extensões universitárias, ou seja, de propósito conservador. Exceções por nome de receita (maionese, vinagrete, pesto, patês…) estão em `src/lib/freezer.ts`. **São estimativas a validar com a nutricionista**; cada item do freezer permite ajustar o prazo. As fontes estão listadas em **Guias → Validade no freezer**.

## Rodar localmente

Requer Node 22+.

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes (vitest)
npm run build      # confere os tipos e gera dist/
npm run preview    # serve o dist/ para conferir o PWA e o modo offline
```

## Publicar no GitHub Pages

O fluxo `.github/workflows/deploy.yml` roda os testes, gera o build e publica a cada push em `main`.

1. No repositório, abra **Settings → Pages**.
2. Em **Source**, escolha **GitHub Actions**.
3. Faça um push em `main` (ou rode o fluxo em **Actions → Publicar no GitHub Pages → Run workflow**).

Repositório privado só publica no Pages em planos pagos do GitHub. O app usa `HashRouter` e `base: './'`, então funciona em qualquer endereço (Pages, domínio próprio ou abrindo a pasta `dist` localmente).

## Proteção do conteúdo e compartilhamento

- **Marca d'água** com o e-mail do membro sobre todas as telas (o administrador fica de fora). É a peça que torna um vazamento rastreável.
- **Bloqueios no navegador**: seleção, cópia (o que for copiado vira um aviso com o link da página de vendas), arrastar, menu de contexto, salvar página e impressão (o CSS esconde tudo no papel; só a etiqueta do freezer imprime). A tela é coberta quando o app vai para o segundo plano (celular) e ao apertar PrintScreen.
- **Limite honesto**: nenhum site consegue impedir o print do sistema nem a foto da tela por outro aparelho. Proteção forte exige o conteúdo fora do repositório e do pacote do app (servidor com login) e, no celular, um aplicativo nativo.
- **Único compartilhamento**: a Lista de compras, em texto + PDF com a logo e o QR code do site (`src/lib/shoppingPdf.ts`, `src/lib/share.ts`). A copy e os links com UTM ficam em `src/lib/invite.ts`.
- Código: `src/lib/protect.ts`, `src/components/Shield.tsx` e o bloco "proteção do conteúdo" em `src/styles.css`.

## Estrutura

```
src/
  data/recipes.json     449 receitas (fonte única), data/index.ts (busca e categorias)
  data/guides.ts        textos dos guias
  lib/                  regras de negócio, puras e testadas
    dates.ts            datas ISO (AAAA-MM-DD), semana começando na segunda
    freezer.ts          prazos por categoria, status, ordem PEPS
    shopping.ts         leitura dos ingredientes, soma por unidade, seções do mercado
    planner.ts          plano semanal e geração do cardápio (aleatório com semente)
    backup.ts           formato e validação do arquivo de backup
    store.ts            armazenamento local (prefixo cfc:) + hooks
  screens/              telas (Início, Receitas, Freezer, Planner, Compras, Guias…)
  components/           layout, ícones, janelas (Sheet), avisos rápidos, seletor de receitas
public/img/             fotos das receitas
```

Chaves salvas no navegador (prefixo `cfc:`): `fav`, `fz` (freezer), `plan`, `shop.rec`, `shop.man`, `shop.chk`, `ing:<id>`, `step:<id>`, `prefs`.

## Stack

React 19, React Router 7 (HashRouter), TypeScript estrito, Vite 8, vite-plugin-pwa (service worker com atualização automática e cache das fotos conforme são vistas) e Vitest. Fontes (Plus Jakarta Sans, Inter e Barlow Condensed) incluídas no projeto, sem depender de CDN.

## Aviso

Os valores nutricionais e os prazos de validade são estimativas e não substituem a orientação de um nutricionista.
