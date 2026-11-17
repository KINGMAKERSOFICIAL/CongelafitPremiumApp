import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES, RECIPES, getCategory, recipesOf } from '../data';
import { CategoryIcon, Icon } from '../components/Icon';
import { RecipeCard } from '../components/RecipeCard';

const CATEGORY_LABELS: Record<string, string> = {
  'sufles-e-tortas': 'Tortas',
  'peixes-e-frutos-do-mar': 'Peixes',
  aves: 'Aves',
  carnes: 'Carnes',
  'legumes-e-acompanhamentos': 'Legumes',
  'pizzas-e-massas': 'Massas',
  saladas: 'Saladas',
  'sopas-caldos-e-cremes': 'Sopas',
  'farinhas-e-farofas': 'Farofas',
  'molhos-maioneses-e-pates': 'Molhos',
  'omeletes-e-ovos': 'Ovos',
  'paes-panquecas-e-lanches': 'Pães',
  'mingaus-granolas-e-iogurtes': 'Granolas',
  'bebidas-e-vitaminas': 'Bebidas',
  'cafe-da-manha-para-congelar': 'Café',
  'lanches-para-congelar': 'Lanches',
  'almoco-para-congelar': 'Almoço',
  'molhos-marinadas-e-temperos-para-congelar': 'Marinadas',
  'bolos-e-tortas-doces': 'Bolos',
  'pudins-mousses-e-cremes': 'Pudins',
  'docinhos-e-biscoitos': 'Docinhos',
  'sorvetes-e-picoles': 'Sorvetes',
  'doces-saudaveis-e-funcionais': 'Funcionais',
};

function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor((i * list.length) / n)]);
  return out;
}

export function Browse() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedId = getCategory(searchParams.get('cat') ?? undefined)?.id ?? CATEGORIES[0]?.id ?? '';
  const selectedCat = getCategory(selectedId);
  const selectedRecipes = useMemo(() => recipesOf(selectedId), [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

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
        <form className="searchbox" onSubmit={submit} role="search">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Prato ou ingrediente…"
            aria-label="Buscar receitas"
            enterKeyHint="search"
          />
          <button type="submit" className="searchbox-submit" aria-label="Buscar">
            <Icon name="search" size={20} />
          </button>
        </form>
        <nav className="cat-circles" aria-label="Categorias de receitas">
          {CATEGORIES.map((c) => {
            const active = c.id === selectedId;
            const shortLabel = CATEGORY_LABELS[c.id] ?? c.name.split(' ')[0];
            return (
              <button
                key={c.id}
                type="button"
                className={`cat-circle-item ${active ? 'active' : ''}`}
                aria-pressed={active}
                aria-label={c.name}
                onClick={() => setSearchParams({ cat: c.id }, { replace: true })}
                title={c.name}
              >
                <span className="cat-circle-ring">
                  <CategoryIcon categoryId={c.id} size={24} />
                </span>
                <span className="cat-circle-name">{shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </section>

      <div className="home-scroll" ref={scrollRef}>
        <section className="block block-filtered" aria-label={selectedCat?.name ?? 'Receitas da categoria'}>
          <div className="recipe-grid">
            {selectedRecipes.map((r) => (
              <RecipeCard key={r.id} r={r} />
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
    </div>
  );
}
