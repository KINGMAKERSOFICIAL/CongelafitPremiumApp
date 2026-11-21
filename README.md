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

- Login, contas, planos Básico/Pro e controle de acesso.
- Integração com a Kiwify (webhook de compra) e com banco de dados (Supabase).

Todos os dados do usuário ficam **só no aparelho** (`localStorage`). Para trocar de celular, use **Mais → Backup**.

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
