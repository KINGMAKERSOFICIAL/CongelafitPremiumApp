import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES, RECIPES, getCategory, recipesOf } from '../data';
import { CategoryIcon, Icon } from '../components/Icon';
import { RecipeCard } from '../components/RecipeCard';

const HIGHLIGHTS = [
  {
    id: 'almoco-e-jantar',
    section: 'Almoço e jantar',
    label: 'Almoço e jantar',
    iconId: 'almoco-para-congelar',
  },
  {
    id: 'bases-e-acompanhamentos',
    section: 'Bases e acompanhamentos',
    label: 'Bases e Acompanhamentos',
    iconId: 'molhos-maioneses-e-pates',
  },
  {
    id: 'cafe-da-manha-e-lanches',
    section: 'Café da manhã e lanches',
    label: 'Café da manhã e lanches',
    iconId: 'cafe-da-manha-para-congelar',
  },
  {
    id: 'doces-e-sobremesas',
    section: 'Doces e sobremesas',
    label: 'Doces e sobremesas',
    iconId: 'bolos-e-tortas-doces',
  },
] as const;

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

  const selected = useMemo(() => {
    const secParam = searchParams.get('sec');
    const bySec = HIGHLIGHTS.find((h) => h.id === secParam || h.section === secParam);
    if (bySec) return bySec;

    const cat = getCategory(searchParams.get('cat') ?? undefined);
    if (cat) {
      const byCat = HIGHLIGHTS.find((h) => h.section === cat.section);
      if (byCat) return byCat;
    }

    return HIGHLIGHTS[0];
  }, [searchParams]);

  const selectedRecipes = useMemo(() => {
    const catIds = CATEGORIES.filter((c) => c.section === selected.section).map((c) => c.id);
    return catIds.flatMap((id) => recipesOf(id));
  }, [selected.section]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [selected.id]);

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
        <nav className="cat-circles" aria-label="Seções de receitas">
          {HIGHLIGHTS.map((h) => {
            const active = h.id === selected.id;
            return (
              <button
                key={h.id}
                type="button"
                className={`cat-circle-item ${active ? 'active' : ''}`}
                aria-pressed={active}
                aria-label={h.label}
                onClick={() => setSearchParams({ sec: h.id }, { replace: true })}
                title={h.label}
              >
                <span className="cat-circle-ring">
                  <CategoryIcon categoryId={h.iconId} size={22} />
                </span>
                <span className="cat-circle-name">{h.label}</span>
              </button>
            );
          })}
        </nav>
      </section>

      <div className="home-scroll" ref={scrollRef}>
        <section className="block block-filtered" aria-label={selected.label}>
          <div className="recipe-grid">
            {selectedRecipes.map((r) => (
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
    </div>
  );
}
