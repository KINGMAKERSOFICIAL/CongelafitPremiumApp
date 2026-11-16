/**
 * Guias do app. Textos próprios em português, baseados nas orientações do USDA (FSIS / FoodSafety.gov)
 * e de extensões universitárias — ver a lista de fontes no guia "Validade no freezer".
 */
export type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'tip'; text: string }
  | { t: 'warn'; text: string }
  | { t: 'shelf' }
  | { t: 'sources'; items: { label: string; url: string }[] };

export interface Guide {
  id: string;
  title: string;
  summary: string;
  icon: string;
  blocks: Block[];
}

export const GUIDES: Guide[] = [
  {
    id: 'congelar',
    title: 'Como congelar com segurança',
    summary: 'Do fogão ao freezer: esfriar, porcionar, embalar e etiquetar.',
    icon: 'snow',
    blocks: [
      {
        t: 'p',
        text: 'Congelar a −18 °C paralisa os microrganismos, mas não “limpa” a comida: o que entra no freezer sai igual. Por isso o cuidado está antes de congelar e na hora de descongelar.',
      },
      { t: 'h', text: 'Passo a passo' },
      {
        t: 'ol',
        items: [
          'Cozinhe por completo e esfrie rápido. Divida em porções rasas (até uns 7 cm de espessura) para esfriar mais depressa; se quiser, apoie o pote em uma vasilha com gelo.',
          'Leve à geladeira ou ao freezer em até 2 horas depois de pronto (1 hora em dia muito quente).',
          'Porcione em marmitas do tamanho de uma refeição. Assim você descongela só o que vai comer.',
          'Embale sem ar: potes próprios para freezer ou saquinhos, espremendo o ar antes de fechar. Em sopas e molhos, deixe uns 2 cm livres no topo, porque o líquido expande ao congelar.',
          'Etiquete com nome, data e quantidade. No app: Meu Freezer → Etiqueta.',
          'Na primeira hora, deixe os saquinhos deitados em camada única; depois de firmes, empilhe. Congela mais rápido e ocupa menos espaço.',
          'Registre no Meu Freezer. O app calcula a validade e avisa o que consumir primeiro.',
        ],
      },
      {
        t: 'tip',
        text: 'Se não for comer em 3 a 4 dias, congele. Quanto mais fresca a comida entra no freezer, melhor ela sai.',
      },
      { t: 'h', text: 'Temperatura do freezer' },
      {
        t: 'p',
        text: 'Mantenha o freezer em −18 °C ou menos. Um termômetro próprio para freezer custa pouco e tira a dúvida. Abrir a porta toda hora e deixar o freezer abarrotado atrapalham o frio.',
      },
      {
        t: 'warn',
        text: 'Comida que ficou mais de 2 horas fora da geladeira não deve ser guardada nem congelada. Na dúvida, descarte.',
      },
    ],
  },
  {
    id: 'descongelar',
    title: 'Descongelar e reaquecer',
    summary: 'Três jeitos seguros de descongelar e a temperatura certa para servir.',
    icon: 'thermo',
    blocks: [
      {
        t: 'p',
        text: 'Existem três jeitos seguros de descongelar: na geladeira, em água fria e no micro-ondas. Nunca descongele na bancada ou na pia: a parte de fora esquenta e as bactérias crescem enquanto o miolo ainda está duro.',
      },
      { t: 'h', text: 'Os três jeitos' },
      {
        t: 'ul',
        items: [
          'Geladeira (o melhor): passe a marmita do freezer para a geladeira na véspera. Porções pequenas descongelam de um dia para o outro; peças grandes levam mais. Depois de descongelada assim, a comida dura de 3 a 4 dias na geladeira e, se sobrar, pode voltar ao freezer (com alguma perda de textura).',
          'Água fria: coloque o alimento em pote bem fechado ou saquinho sem vazamento, mergulhado em água fria. Troque a água a cada 30 minutos. É mais rápido, mas é preciso cozinhar ou aquecer logo depois; não congele de novo sem aquecer antes.',
          'Micro-ondas: use a função descongelar e aqueça em seguida, porque algumas partes já começam a esquentar. O que sobrar só volta ao freezer depois de aquecido até 74 °C.',
        ],
      },
      { t: 'h', text: 'Reaquecer' },
      {
        t: 'p',
        text: 'Aqueça até 74 °C no centro: quente e fumegante. Sopas, caldos e molhos devem chegar à fervura. Também é seguro reaquecer direto do congelado, sem descongelar: em panela com um pouco de líquido (sopas e ensopados) ou no forno e no micro-ondas (tortas, suflês, marmitas), mexendo no meio do tempo.',
      },
      {
        t: 'tip',
        text: 'Aqueça só a porção que vai comer. Reaquecer a mesma comida várias vezes piora o sabor e a segurança.',
      },
      {
        t: 'p',
        text: 'Doces, mousses, bolos e sorvetes não precisam de aquecimento: descongele na geladeira e sirva gelado ou em temperatura ambiente.',
      },
    ],
  },
  {
    id: 'validade',
    title: 'Validade no freezer',
    summary: 'Prazo de qualidade sugerido para cada categoria de receita.',
    icon: 'calendar',
    blocks: [
      {
        t: 'p',
        text: 'Em freezer mantido sempre a −18 °C, a comida continua segura por muito tempo. O que acaba é a qualidade: com os meses ela resseca, perde sabor e muda de textura. Os prazos abaixo são de qualidade, não de segurança.',
      },
      {
        t: 'p',
        text: 'Para escolher cada prazo usamos o menor limite superior entre as tabelas consultadas (USDA, FoodSafety.gov e extensões universitárias), ou seja, de propósito mais curto que o máximo possível. São estimativas a validar com a nutricionista e podem ser ajustadas em cada item do seu freezer.',
      },
      { t: 'shelf' },
      {
        t: 'tip',
        text: 'Passou do prazo no app? Não significa que estragou: avalie cheiro, cor e textura e use primeiro. Se tiver dúvida de verdade, descarte.',
      },
      { t: 'h', text: 'Fontes consultadas' },
      {
        t: 'sources',
        items: [
          {
            label: 'USDA FSIS — Freezing and Food Safety',
            url: 'https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/freezing-and-food-safety',
          },
          {
            label: 'USDA FSIS — Leftovers and Food Safety',
            url: 'https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/leftovers-and-food-safety',
          },
          {
            label: 'University of Illinois Extension — Freezer storage',
            url: 'https://extension.illinois.edu/food-safety/freezer-storage',
          },
          {
            label: 'Ohio State University Extension — Food storage chart (HYG-5402)',
            url: 'https://ohioline.osu.edu/factsheet/HYG-5402',
          },
          { label: 'Food Hero — Freezing leftovers', url: 'https://foodhero.org/node/17586' },
        ],
      },
    ],
  },
  {
    id: 'embalagem',
    title: 'Potes, sacos e porcionamento',
    summary: 'Como embalar para evitar queimadura de freezer e desperdício.',
    icon: 'box',
    blocks: [
      { t: 'h', text: 'O que usar' },
      {
        t: 'ul',
        items: [
          'Potes herméticos próprios para freezer (plástico ou vidro temperado). Não leve o vidro direto do freezer para o forno quente: o choque térmico quebra.',
          'Saquinhos zip: encha, espreme o ar e congele deitados. Ficam finos, empilham bem e descongelam rápido.',
          'Forminhas de gelo ou de silicone: perfeitas para pesto, molhos, caldos e temperos. Depois de firmes, passe os cubos para um saquinho.',
          'Papel manteiga entre fatias de pão, panquecas, bolos e biscoitos, para soltar só o que for comer.',
          'Filme plástico encostado na superfície de cremes e sorvetes, para evitar cristais de gelo.',
        ],
      },
      { t: 'h', text: 'Porcionar' },
      {
        t: 'p',
        text: 'Congele em porções do tamanho de uma refeição. Para uma pessoa, uma marmita por pote; para a família, o pote com o número de pratos que vão sentar à mesa. Dividir é mais trabalho no dia do preparo e economiza no resto da semana.',
      },
      { t: 'h', text: 'Queimadura de freezer' },
      {
        t: 'p',
        text: 'Manchas esbranquiçadas e ressecadas aparecem quando o alimento fica em contato com o ar. Não faz mal à saúde, mas deixa a comida seca e sem sabor. A solução é embalar sem ar e dentro do prazo.',
      },
    ],
  },
  {
    id: 'semana',
    title: 'Rotina de marmitas da semana',
    summary: 'Um dia de cozinha, a semana inteira resolvida.',
    icon: 'list',
    blocks: [
      {
        t: 'p',
        text: 'A rotina que funciona para a maioria das pessoas: escolher no domingo (ou no dia de folga), cozinhar tudo em um bloco de umas 3 horas e deixar o restante da semana só para descongelar e aquecer.',
      },
      { t: 'h', text: 'Antes de cozinhar' },
      {
        t: 'ol',
        items: [
          'Planner: monte o cardápio da semana (botão “Montar cardápio”) e troque o que não agradar.',
          'Compras: toque em “Lista de compras da semana”, confira o que você já tem em casa e marque no mercado conforme for pegando.',
        ],
      },
      { t: 'h', text: 'No dia de cozinhar' },
      {
        t: 'ol',
        items: [
          'Comece pelo que demora mais (assados, ensopados, caldos) e aproveite o forno para duas receitas ao mesmo tempo.',
          'Enquanto isso, prepare o que é rápido: refogados, legumes, molhos.',
          'Deixe esfriar em porções rasas, embale, etiquete e registre no Meu Freezer.',
          'Deixe na geladeira o que vai comer nos próximos 3 a 4 dias; congele o resto.',
        ],
      },
      { t: 'h', text: 'Durante a semana' },
      {
        t: 'ul',
        items: [
          'Na véspera, passe a marmita do dia seguinte do freezer para a geladeira.',
          'Dê uma olhada no Início do app: ele mostra o que vence primeiro.',
          'Quando uma marmita for consumida, toque em “Comi 1” no Meu Freezer.',
        ],
      },
    ],
  },
  {
    id: 'nao-congela',
    title: 'O que não vai bem no freezer',
    summary: 'Preparos que perdem a textura ou separam ao congelar.',
    icon: 'warn',
    blocks: [
      {
        t: 'p',
        text: 'Quase tudo que é cozido congela bem. Algumas coisas, porém, mudam tanto que não compensam. Para elas, prefira a geladeira (em geral 3 a 4 dias).',
      },
      {
        t: 'ul',
        items: [
          'Maionese caseira e molhos com ovo cru: a emulsão separa. Mantenha refrigerados e consuma logo.',
          'Folhas e saladas cruas, pepino, tomate e rabanete crus: ficam murchos e aguados. Cozidos ou em molhos, tudo bem.',
          'Ovos cozidos: a clara fica borrachuda. Ovos na casca nunca devem ser congelados.',
          'Cremes, iogurtes, pudins e mousses com gelatina: podem soltar água e talhar. Teste com uma porção pequena antes.',
          'Frituras e empanados crocantes: amolecem. Reaqueça no forno para recuperar a crocância.',
          'Coberturas de açúcar caramelizado (como a do crème brûlée) não sobrevivem ao congelamento.',
        ],
      },
      {
        t: 'tip',
        text: 'No cadastro do Meu Freezer, o app avisa quando uma receita não costuma congelar bem e sugere o prazo.',
      },
    ],
  },
];

export const getGuide = (id: string | undefined) => GUIDES.find((g) => g.id === id);
