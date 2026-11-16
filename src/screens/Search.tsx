import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { search } from '../data';
import { Icon } from '../components/Icon';
import { RecipeCard } from '../components/RecipeCard';

const SUGGEST = [
  'frango',
  'abobrinha',
  'chocolate',
  'coco',
  'queijo',
  'ovo',
  'berinjela',
  'amêndoas',
  'salmão',
  'maracujá',
];

export function Search() {
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const [q, setQ] = useState(urlQ);

  useEffect(() => setQ(urlQ), [urlQ]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== urlQ) setParams(q ? { q } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [q, urlQ, setParams]);

  const results = useMemo(() => search(urlQ), [urlQ]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Buscar receitas</h1>
        <p>Procure pelo nome do prato ou por qualquer ingrediente.</p>
      </header>
      <div className="searchbox big" role="search">
        <Icon name="search" size={20} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ex.: frango abobrinha"
          aria-label="Buscar receitas"
          autoFocus
          enterKeyHint="search"
        />
        {q && (
          <button type="button" className="clear" aria-label="Limpar busca" onClick={() => setQ('')}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      {!urlQ && (
        <div className="suggest">
          <p>Sugestões</p>
          <div className="chips">
            {SUGGEST.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => setQ(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {urlQ && (
        <>
          <p className="count-line" aria-live="polite">
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'} para “{urlQ}”
          </p>
          {results.length ? (
            <div className="recipe-grid">
              {results.map((r) => (
                <RecipeCard key={r.id} r={r} showCat />
              ))}
            </div>
          ) : (
            <p className="empty">Nada encontrado. Tente uma palavra mais curta, como “frango” ou “coco”.</p>
          )}
        </>
      )}
    </div>
  );
}
