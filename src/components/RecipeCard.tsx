import { Link } from 'react-router-dom';
import { getCategory } from '../data';
import { trackEvent } from '../lib/api';
import { useFavorites } from '../lib/store';
import type { Recipe } from '../types';
import { basisLabel } from '../lib/text';
import { Icon } from './Icon';
import { Photo } from './Photo';

export function FavButton({ id, title, className = '' }: { id: string; title: string; className?: string }) {
  const fav = useFavorites();
  const on = fav.has(id);
  return (
    <button
      type="button"
      className={`fav ${on ? 'on' : ''} ${className}`}
      aria-pressed={on}
      aria-label={on ? `Remover ${title} dos favoritos` : `Favoritar ${title}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!on) trackEvent('favorite_toggle', id, title);
        fav.toggle(id);
      }}
    >
      <Icon name="heart" size={20} />
    </button>
  );
}

export function RecipeCard({ r, showCat = false }: { r: Recipe; showCat?: boolean }) {
  const cat = showCat ? getCategory(r.cat) : undefined;
  return (
    <Link to={`/receita/${r.id}`} className="card recipe-card">
      <div className="card-photo">
        <Photo recipe={r} />
        <FavButton id={r.id} title={r.title} />
      </div>
      <div className="card-body">
        {cat && <span className="tag">{cat.name}</span>}
        <h3>{r.title}</h3>
        <div className="meta">
          <span className="meta-kcal">
            <Icon name="flame" size={15} />
            <b>{r.kcal}</b> kcal<small> {basisLabel(r.basis)}</small>
          </span>
          {r.time && (
            <span className="meta-time">
              <Icon name="clock" size={15} />
              {r.time}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
