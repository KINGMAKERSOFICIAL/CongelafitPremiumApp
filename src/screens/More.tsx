import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

const ITEMS = [
  {
    to: '/guias',
    icon: 'shield',
    title: 'Guias',
    text: 'Congelar, descongelar, validade e rotina de marmitas.',
  },
  {
    to: '/favoritos',
    icon: 'heart',
    title: 'Receitas favoritas',
    text: 'As receitas que você marcou com o coração.',
  },
  { to: '/buscar', icon: 'search', title: 'Buscar receitas', text: 'Por prato ou ingrediente.' },
  {
    to: '/backup',
    icon: 'download',
    title: 'Backup dos dados',
    text: 'Salve ou restaure freezer, planner e lista de compras.',
  },
  {
    to: '/sobre',
    icon: 'info',
    title: 'Sobre o app',
    text: 'Como ler calorias, rendimento e o que o app guarda.',
  },
];

export function More() {
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Mais</p>
        <h1>Outras ferramentas</h1>
      </header>
      <ul className="guide-grid">
        {ITEMS.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="card guide-card">
              <span className="guide-ico">
                <Icon name={i.icon} size={26} />
              </span>
              <div>
                <h2>{i.title}</h2>
                <p>{i.text}</p>
              </div>
              <Icon name="arrow" size={18} />
            </Link>
          </li>
        ))}
      </ul>
      <p className="small foot-note">
        CongelaFit Premium · <a href="https://www.congelafit.com.br">www.congelafit.com.br</a>
      </p>
    </div>
  );
}
