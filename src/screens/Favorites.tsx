import { Link } from 'react-router-dom';
import { getRecipe } from '../data';
import { RecipeCard } from '../components/RecipeCard';
import { useFavorites } from '../lib/store';
import type { Recipe } from '../types';

export function Favorites() {
  const fav = useFavorites();
  const list = fav.list.map((id) => getRecipe(id)).filter((r): r is Recipe => !!r);
  return (
    <div className="page">
      <header className="page-head">
        <h1>Favoritos</h1>
        <p>As receitas que você marcou com o coração ficam salvas neste aparelho.</p>
      </header>
      {list.length ? (
        <div className="recipe-grid">
          {list.map((r) => (
            <RecipeCard key={r.id} r={r} showCat />
          ))}
        </div>
      ) : (
        <div className="empty-page">
          <p className="empty">
            Você ainda não tem favoritos. Toque no coração de uma receita para guardá-la aqui.
          </p>
          <Link className="btn" to="/">
            Ver categorias
          </Link>
        </div>
      )}
    </div>
  );
}
