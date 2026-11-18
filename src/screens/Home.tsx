import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { RecipeCard } from '../components/RecipeCard';
import { RECIPES, getRecipe } from '../data';
import { WEEKDAYS, fmtDM, weekdayIndex } from '../lib/dates';
import { STATUS_LABEL, sortFifo, statusOf, statusText, summarize, unitText } from '../lib/freezer';
import { useFreezer, usePlan, useShopLines, useToday } from '../lib/hooks';
import { SLOTS, recipesIn } from '../lib/planner';
import { useFavorites } from '../lib/store';
import type { Recipe } from '../types';

const SHORTCUTS = [
  { to: '/receitas', label: 'Receitas', icon: 'book' },
  { to: '/guias', label: 'Guias', icon: 'shield' },
  { to: '/favoritos', label: 'Favoritas', icon: 'heart' },
  { to: '/buscar', label: 'Buscar', icon: 'search' },
];

export function Home() {
  const today = useToday();
  const { items } = useFreezer();
  const { plan } = usePlan();
  const shop = useShopLines();
  const fav = useFavorites();

  const sum = summarize(items, today);
  const next = useMemo(() => sortFifo(items).slice(0, 3), [items]);
  const meals = SLOTS.flatMap((s) => {
    const rs = recipesIn(plan, today, s.id).flatMap((id) => {
      const r = getRecipe(id);
      return r ? [r] : [];
    });
    return rs.length ? [{ slot: s, recipes: rs }] : [];
  });

  const daily = useMemo(() => {
    const day = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86_400_000);
    const pool = RECIPES.filter((r) => r.img && r.basis === 'porção');
    const picks: Recipe[] = [];
    for (let k = 0; picks.length < 3 && k < 30; k++) {
      const r = pool[(day * 37 + k * 131) % pool.length];
      if (!picks.includes(r)) picks.push(r);
    }
    return picks;
  }, [today]);

  const alerts = sum.soon + sum.expired;
  const shopTotal = shop.lines.length;

  return (
    <div className="page dash">
      <header className="page-head">
        <p className="eyebrow">{WEEKDAYS[weekdayIndex(today)]}</p>
        <div className="dash-date-row">
          <h1>Hoje, {fmtDM(today)}</h1>
          <Link to="/receitas" className="dash-recipe-count">
            <Icon name="book" size={16} />
            <b>{RECIPES.length}</b> receitas
          </Link>
        </div>
        <p>Seu freezer, o cardápio do dia e a lista de compras em um só lugar.</p>
      </header>

      <div className="dash-grid">
        <section className="card dash-card" aria-labelledby="d-fz">
          <div className="dash-head">
            <h2 id="d-fz">
              <Icon name="snow" size={20} /> Meu Freezer
            </h2>
            <Link to="/freezer" className="link-btn">
              Abrir <Icon name="arrow" size={14} />
            </Link>
          </div>
          {items.length === 0 ? (
            <div className="dash-empty">
              <p>Registre as marmitas que você congelou e o app avisa o que consumir primeiro.</p>
              <Link to="/freezer/novo" className="btn sm">
                <Icon name="plus" size={16} /> Registrar marmita
              </Link>
            </div>
          ) : (
            <>
              <p className="dash-sum">
                <b>{sum.portions}</b> {sum.portions === 1 ? 'porção' : 'porções'} em <b>{sum.items}</b>{' '}
                {sum.items === 1 ? 'item' : 'itens'}
                {alerts > 0 && (
                  <span className={`pill ${sum.expired ? 'expired' : 'soon'}`}>
                    {alerts} {alerts === 1 ? 'pede atenção' : 'pedem atenção'}
                  </span>
                )}
              </p>
              <p className="dash-sub">Consumir primeiro</p>
              <ul className="dash-list">
                {next.map((it) => {
                  const st = statusOf(it, today);
                  return (
                    <li key={it.id}>
                      <div>
                        <b>{it.name}</b>
                        <small>
                          {it.portions} {unitText(it.unit, it.portions)} · {statusText(it, today)}
                        </small>
                      </div>
                      <span className={`pill ${st}`}>{STATUS_LABEL[st]}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section className="card dash-card" aria-labelledby="d-pl">
          <div className="dash-head">
            <h2 id="d-pl">
              <Icon name="calendar" size={20} /> Cardápio de hoje
            </h2>
            <Link to="/planner" className="link-btn">
              Abrir <Icon name="arrow" size={14} />
            </Link>
          </div>
          {meals.length === 0 ? (
            <div className="dash-empty">
              <p>Nada planejado para hoje. Monte a semana em poucos toques.</p>
              <Link to="/planner" className="btn sm">
                <Icon name="spark" size={16} /> Planejar
              </Link>
            </div>
          ) : (
            <ul className="dash-list">
              {meals.map(({ slot, recipes }) => (
                <li key={slot.id}>
                  <div>
                    <small className="slot-name">{slot.name}</small>
                    {recipes.map((r) => (
                      <Link key={r.id} to={`/receita/${r.id}`} className="dash-recipe">
                        {r.title}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card dash-card" aria-labelledby="d-sh">
          <div className="dash-head">
            <h2 id="d-sh">
              <Icon name="cart" size={20} /> Compras
            </h2>
            <Link to="/compras" className="link-btn">
              Abrir <Icon name="arrow" size={14} />
            </Link>
          </div>
          {shopTotal === 0 ? (
            <div className="dash-empty">
              <p>Sua lista está vazia. Adicione receitas e as quantidades são somadas automaticamente.</p>
            </div>
          ) : (
            <p className="dash-sum">
              <b>{shop.open}</b> {shop.open === 1 ? 'item falta' : 'itens faltam'} de {shopTotal}
            </p>
          )}
        </section>
      </div>

      <ul className="shortcuts" aria-label="Atalhos">
        {SHORTCUTS.map((s) => (
          <li key={s.to}>
            <Link to={s.to} className="card shortcut">
              <Icon name={s.icon} size={22} />
              <span>
                {s.label}
                {s.to === '/favoritos' && fav.list.length > 0 ? ` (${fav.list.length})` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="block" aria-labelledby="s-hoje">
        <div className="block-head">
          <h2 id="s-hoje">Para hoje</h2>
          <p>Sugestões que mudam todo dia</p>
        </div>
        <div className="recipe-grid">
          {daily.map((r) => (
            <RecipeCard key={r.id} r={r} showCat />
          ))}
        </div>
      </section>
    </div>
  );
}
