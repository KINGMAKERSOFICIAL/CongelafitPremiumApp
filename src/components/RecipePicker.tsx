import { useMemo, useState } from 'react';
import { CATEGORIES, RECIPES, getCategory, search } from '../data';
import { useFavorites } from '../lib/store';
import type { Recipe } from '../types';
import { Icon } from './Icon';
import { imgUrl } from './Photo';
import { Sheet } from './Sheet';

/** Escolhe uma receita do livro: busca, favoritas e filtro por categoria. */
export function RecipePicker({
  open,
  title = 'Escolher receita',
  onClose,
  onPick,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onPick: (r: Recipe) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} wide>
      <PickerBody onPick={onPick} />
    </Sheet>
  );
}

function PickerBody({ onPick }: { onPick: (r: Recipe) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const fav = useFavorites();

  const results = useMemo(() => {
    let list = q.trim() ? search(q) : RECIPES;
    if (cat) list = list.filter((r) => r.cat === cat);
    if (onlyFav) list = list.filter((r) => fav.list.includes(r.id));
    return list;
  }, [q, cat, onlyFav, fav.list]);

  return (
    <div className="picker">
      <div className="searchbox">
        <Icon name="search" size={20} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Prato ou ingrediente…"
          aria-label="Buscar receita"
          autoFocus
        />
      </div>
      <div className="picker-filters">
        <button
          type="button"
          className={`chip ${onlyFav ? 'on' : ''}`}
          aria-pressed={onlyFav}
          onClick={() => setOnlyFav((v) => !v)}
          disabled={fav.list.length === 0}
        >
          <Icon name="heart" size={15} /> Favoritas ({fav.list.length})
        </button>
        <label className="select">
          <span className="sr">Categoria</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="count-line">
        {results.length} {results.length === 1 ? 'receita' : 'receitas'}
        {results.length > 40 ? ' — mostrando as 40 primeiras' : ''}
      </p>
      <ul className="picker-list">
        {results.slice(0, 40).map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onPick(r)}>
              {r.img ? (
                <img
                  src={imgUrl(r.img, true)}
                  alt=""
                  width={64}
                  height={42}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="thumb-empty" aria-hidden="true" />
              )}
              <span className="t">
                <b>{r.title}</b>
                <small>
                  {getCategory(r.cat)?.name} · {r.kcal} kcal
                </small>
              </span>
              <Icon name="plus" size={18} />
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="empty">Nenhuma receita encontrada.</li>}
      </ul>
    </div>
  );
}
