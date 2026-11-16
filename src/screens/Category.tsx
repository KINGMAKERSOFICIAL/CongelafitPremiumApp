import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CATEGORIES, getCategory, recipesOf } from '../data';
import { Icon } from '../components/Icon';
import { RecipeCard } from '../components/RecipeCard';
import { NotFound } from './NotFound';

type Sort = 'az' | 'kcal' | 'tempo';
type Max = 0 | 15 | 30;

export function Category() {
  const { id } = useParams();
  const cat = getCategory(id);
  const [sort, setSort] = useState<Sort>('az');
  const [max, setMax] = useState<Max>(0);

  const all = useMemo(() => (cat ? recipesOf(cat.id) : []), [cat]);
  const list = useMemo(() => {
    let l = all.filter((r) => !max || (r.timeMin !== null && r.timeMin <= max));
    if (sort === 'kcal')
      l = [...l].sort((a, b) => a.kcal - b.kcal || a.title.localeCompare(b.title, 'pt-BR'));
    if (sort === 'tempo')
      l = [...l].sort(
        (a, b) => (a.timeMin ?? 999) - (b.timeMin ?? 999) || a.title.localeCompare(b.title, 'pt-BR'),
      );
    return l;
  }, [all, sort, max]);

  if (!cat) return <NotFound />;
  const idx = CATEGORIES.findIndex((c) => c.id === cat.id);
  const prev = CATEGORIES[idx - 1];
  const next = CATEGORIES[idx + 1];

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Você está em">
        <Link to="/receitas">Receitas</Link>
        <Icon name="arrow" size={12} />
        <span>{cat.section}</span>
      </nav>
      <header className="page-head">
        <h1>{cat.name}</h1>
        <p>{cat.desc}</p>
      </header>

      <div className="toolbar">
        <div className="chips" role="group" aria-label="Filtrar por tempo de preparo">
          {([0, 15, 30] as Max[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`chip ${max === m ? 'on' : ''}`}
              aria-pressed={max === m}
              onClick={() => setMax(m)}
            >
              {m === 0 ? 'Todas' : `Até ${m} min`}
            </button>
          ))}
        </div>
        <label className="select">
          <span>Ordenar</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="az">A–Z</option>
            <option value="kcal">Menos calorias</option>
            <option value="tempo">Mais rápidas</option>
          </select>
        </label>
      </div>
      <p className="count-line" aria-live="polite">
        {list.length} de {all.length} {all.length === 1 ? 'receita' : 'receitas'}
      </p>

      {list.length ? (
        <div className="recipe-grid">
          {list.map((r) => (
            <RecipeCard key={r.id} r={r} />
          ))}
        </div>
      ) : (
        <p className="empty">Nenhuma receita com esse filtro. Tente “Todas”.</p>
      )}

      <nav className="pager" aria-label="Outras categorias">
        {prev ? (
          <Link to={`/categoria/${prev.id}`} className="pager-prev">
            <small>Anterior</small>
            {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/categoria/${next.id}`} className="pager-next">
            <small>Próxima</small>
            {next.name}
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
