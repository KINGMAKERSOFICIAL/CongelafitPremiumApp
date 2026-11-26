import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { apiFetch, trackEvent } from '../lib/api';
import { useAuth } from '../lib/auth';

export interface PublicAffiliateProduct {
  id: string;
  title: string;
  description: string;
  category: string;
  priceLabel: string;
  imageUrl: string;
  affiliateUrl: string;
  badge?: string;
}

export function ShopItems() {
  const { user } = useAuth();
  const [products, setProducts] = useState<PublicAffiliateProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('Todas');

  useEffect(() => {
    let active = true;
    apiFetch<{ products: PublicAffiliateProduct[] }>('/api/products')
      .then((res) => {
        if (active) setProducts(res.products ?? []);
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>(['Todas']);
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return [...set];
  }, [products]);

  const filtered = useMemo(
    () => (cat === 'Todas' ? products : products.filter((p) => p.category === cat)),
    [products, cat],
  );

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/mais">Mais</Link> <Icon name="arrow" size={12} /> <span>Itens para o dia a dia</span>
      </div>

      <header className="page-head row">
        <div>
          <p className="eyebrow">Recomendações</p>
          <h1>Itens para o dia a dia</h1>
          <p>Potes, utensílios e acessórios que facilitam o preparo e o congelamento das suas marmitas.</p>
        </div>
        {user?.role === 'admin' && (
          <Link to="/admin?tab=products" className="btn ghost sm">
            <Icon name="edit" size={16} /> Gerenciar itens (Admin)
          </Link>
        )}
      </header>

      {categories.length > 1 && (
        <div className="chips filters" role="group" aria-label="Filtrar por categoria">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${cat === c ? 'on' : ''}`}
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card pad-card">
          <p className="small">Carregando recomendações…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Icon name="bag" size={34} />
          <h2>Nenhum item cadastrado ainda</h2>
          <p>
            Em breve aparecerão aqui os utensílios e potes recomendados pelo administrador para facilitar sua
            rotina na cozinha.
          </p>
          {user?.role === 'admin' && (
            <div className="empty-actions">
              <Link to="/admin?tab=products" className="btn">
                <Icon name="plus" size={18} /> Adicionar primeiro item afiliado
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="product-grid">
          {filtered.map((p) => (
            <article key={p.id} className="card product-card">
              <div className="product-media">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.title} loading="lazy" decoding="async" />
                ) : (
                  <div className="product-placeholder" aria-hidden="true">
                    <Icon name="bag" size={36} />
                  </div>
                )}
                {p.badge && <span className="pill ok product-badge">{p.badge}</span>}
              </div>
              <div className="product-body">
                <span className="tag">{p.category}</span>
                <h2>{p.title}</h2>
                {p.description && <p className="product-desc">{p.description}</p>}
                <div className="product-foot">
                  <strong className="product-price">{p.priceLabel || 'Ver oferta'}</strong>
                  <a
                    href={p.affiliateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn sm"
                    onClick={() => trackEvent('product_click', p.id, p.title)}
                  >
                    <Icon name="external" size={15} /> Adquirir item
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
