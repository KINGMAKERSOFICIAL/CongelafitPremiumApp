import { Link } from 'react-router-dom';
import { CATEGORIES, RECIPES } from '../data';

export function About() {
  return (
    <div className="page prose">
      <header className="page-head">
        <p className="eyebrow">Sobre</p>
        <h1>CongelaFit Premium</h1>
      </header>
      <p>
        O CongelaFit Premium reúne <b>{RECIPES.length} receitas</b> (o livro Low Carb, o Café da Manhã, os Lanches e os Doces Saudáveis para Congelar) em{' '}
        <b>{CATEGORIES.length} categorias</b>, com foto, calorias, rendimento, tempo e modo de preparo passo a
        passo, e ferramentas para organizar a cozinha de marmitas: <b>Meu Freezer</b>, <b>Planner</b> da
        semana e <b>Lista de compras</b>.
      </p>

      <h2>O que o app faz</h2>
      <ul>
        <li>
          <b>Meu Freezer:</b> registre o que você congelou, veja a validade de cada marmita, o que consumir
          primeiro e imprima etiquetas.
        </li>
        <li>
          <b>Planner:</b> monte o cardápio da semana (ou deixe o app sugerir) e veja as calorias do dia.
        </li>
        <li>
          <b>Compras:</b> some os ingredientes das receitas planejadas, agrupados por seção do mercado.
        </li>
        <li>
          <b>Guias:</b> como congelar, descongelar e reaquecer com segurança, e prazos por categoria.
        </li>
      </ul>

      <h2>Seus dados ficam no aparelho</h2>
      <p>
        Favoritas, freezer, planner e lista de compras são salvos no navegador deste aparelho. Não há conta
        nem envio para servidor. Para trocar de celular, use o <Link to="/backup">backup</Link>.
      </p>

      <h2>Low carb não é zero carboidrato</h2>
      <p>
        As receitas têm <b>baixo teor de carboidratos, e não zero carboidratos</b>. A adesão a uma alimentação
        equilibrada e diversificada, com fontes de carboidratos complexos e saudáveis, é a melhor opção para
        uma alimentação saudável. Nem todas as receitas têm baixo valor energético: escolha as melhores para
        você e adapte ao plano alimentar sugerido por um profissional.
      </p>

      <h2>Como ler as informações</h2>
      <ul>
        <li>
          <b>Calorias:</b> estimadas a partir dos ingredientes. Aparecem <b>por porção</b>; em docinhos,
          biscoitos e pães pequenos, <b>por unidade</b>; em molhos, patês, farinhas e farofas,{' '}
          <b>por colher (sopa)</b>.
        </li>
        <li>
          <b>Rende:</b> número de porções, unidades ou colheres que a receita faz.
        </li>
        <li>
          <b>Tempo:</b> preparo e cozimento. Descansos, geladeira e freezer aparecem à parte (“+ 2 h de
          descanso”).
        </li>
        <li>
          <b>Porções (½×, 2×, 3×):</b> ajustam as medidas dos ingredientes e as quantidades da lista de
          compras. Os números dentro do modo de preparo continuam os da receita original.
        </li>
        <li>
          <b>Validade no freezer:</b> prazos de <b>qualidade</b> a −18 °C, escolhidos de forma conservadora a
          partir de fontes oficiais. São estimativas a validar com a nutricionista e você pode ajustar cada
          item.
        </li>
      </ul>

      <p>
        Para mais dicas e planos, visite <a href="https://www.congelafit.com.br">www.congelafit.com.br</a>.
      </p>
      <p className="small">
        Os valores nutricionais e os prazos de validade são estimativas e não substituem a orientação de um
        nutricionista.
      </p>
    </div>
  );
}
