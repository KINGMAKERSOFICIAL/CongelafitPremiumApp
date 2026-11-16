import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATEGORIES, RECIPES, SECTIONS, recipesOf } from '../data';
import { Icon } from '../components/Icon';
import { imgUrl } from '../components/Photo';
import { RecipeCard } from '../components/RecipeCard';
import { useFavorites } from '../lib/store';
import type { Category, Recipe } from '../types';

const SECTION_NOTES: Record<string, string> = {
  'Almoço e jantar': 'Pratos principais para congelar em marmitas',
  'Bases e acompanhamentos': 'Farinhas, farofas, molhos e patês',
  'Café da manhã e lanches': 'Ovos, pães, bebidas e lanches práticos',
  'Doces e sobremesas': 'Bolos, mousses, docinhos e sorvetes',
};

function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor((i * list.length) / n)]);
  return out;
}

function Mosaic({ cat }: { cat: Category }) {
  const photos = spread(
    recipesOf(cat.id).filter((r) => r.img),
    4,
  );
  return (
    <div className={`mosaic m${photos.length}`}>
      {photos.map((r) => (
        <img
          key={r.id}
          src={imgUrl(r.img!, true)}
          alt=""
          width={210}
          height={136}
          loading="lazy"
          decoding="async"
        />
      ))}
    </div>
  );
}

export function Browse() {
  const nav = useNavigate();
  const fav = useFavorites();
  const [q, setQ] = useState('');

  const daily = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    const pool = RECIPES.filter((r) => r.img && r.basis === 'porção');
    const picks: Recipe[] = [];
    for (let k = 0; picks.length < 3 && k < 30; k++) {
      const r = pool[(day * 37 + k * 131) % pool.length];
      if (!picks.includes(r)) picks.push(r);
    }
    return picks;
  }, []);

  const quick = useMemo(
    () =>
      spread(
        RECIPES.filter((r) => r.img && r.basis === 'porção' && r.timeMin !== null && r.timeMin <= 15),
        12,
      ),
    [],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(`/buscar?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="page home">
      <section className="hero">
        <p className="eyebrow">Low Carb e Café da Manhã para Congelar</p>
        <h1>{RECIPES.length} receitas, com foto, calorias e passo a passo</h1>
        <Link to="/favoritos" className="hero-link">
          <Icon name="heart" size={16} /> Minhas favoritas ({fav.list.length})
        </Link>
        <form className="searchbox" onSubmit={submit} role="search">
          <Icon name="search" size={20} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Prato ou ingrediente…"
            aria-label="Buscar receitas"
            enterKeyHint="search"
          />
          <button type="submit">Buscar</button>
        </form>
        <ul className="stats">
          <li>
            <b>{RECIPES.length}</b> receitas
          </li>
          <li>
            <b>{CATEGORIES.length}</b> categorias
          </li>
          <li>
            <b>{RECIPES.filter((r) => r.img).length}</b> fotos
          </li>
        </ul>
      </section>

      {SECTIONS.map((sec) => (
        <section key={sec} className="block" aria-labelledby={`s-${sec}`}>
          <div className="block-head">
            <h2 id={`s-${sec}`}>{sec}</h2>
            <p>{SECTION_NOTES[sec]}</p>
          </div>
          <div className="cat-grid">
            {CATEGORIES.filter((c) => c.section === sec).map((c) => {
              const n = recipesOf(c.id).length;
              return (
                <Link key={c.id} to={`/categoria/${c.id}`} className="card cat-card">
                  <Mosaic cat={c} />
                  <div className="card-body">
                    <h3>{c.name}</h3>
                    <p className="desc">{c.desc}</p>
                    <span className="count">
                      {n} {n === 1 ? 'receita' : 'receitas'} <Icon name="arrow" size={14} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

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

      <section className="block" aria-labelledby="s-rapidas">
        <div className="block-head">
          <h2 id="s-rapidas">Prontas em até 15 minutos</h2>
          <p>Para os dias corridos</p>
        </div>
        <div className="rail">
          {quick.map((r) => (
            <RecipeCard key={r.id} r={r} showCat />
          ))}
        </div>
      </section>
    </div>
  );
}
