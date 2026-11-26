import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { CATEGORIES, SECTIONS } from '../data';
import { GUIDES, getGuide, type Block } from '../data/guides';
import { trackEvent } from '../lib/api';
import { freezeRuleForCat, type Verdict } from '../lib/freezer';
import { NotFound } from './NotFound';

const VERDICT: Record<Verdict, string> = { ok: 'Congela bem', caution: 'Com cuidado', no: 'Não indicado' };

function Shelf() {
  return (
    <div className="shelf">
      {SECTIONS.map((sec) => (
        <section key={sec}>
          <h3>{sec}</h3>
          <ul>
            {CATEGORIES.filter((c) => c.section === sec).map((c) => {
              const r = freezeRuleForCat(c.id);
              return (
                <li key={c.id}>
                  <div className="shelf-head">
                    <b>{c.name}</b>
                    <span
                      className={`pill ${r.verdict === 'ok' ? 'ok' : r.verdict === 'caution' ? 'soon' : 'expired'}`}
                    >
                      {VERDICT[r.verdict]}
                    </span>
                    <span className="months">
                      {r.verdict === 'no' ? 'geladeira' : `${r.months} ${r.months === 1 ? 'mês' : 'meses'}`}
                    </span>
                  </div>
                  <p>{r.note}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p':
            return <p key={i}>{b.text}</p>;
          case 'h':
            return <h2 key={i}>{b.text}</h2>;
          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="guide-steps">
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ol>
            );
          case 'tip':
            return (
              <div key={i} className="callout ok">
                <Icon name="spark" size={20} />
                <p>{b.text}</p>
              </div>
            );
          case 'warn':
            return (
              <div key={i} className="callout no">
                <Icon name="warn" size={20} />
                <p>{b.text}</p>
              </div>
            );
          case 'shelf':
            return <Shelf key={i} />;
          case 'sources':
            return (
              <ul key={i} className="sources">
                {b.items.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </>
  );
}

export function Guides() {
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Guias</p>
        <h1>Congele, descongele e organize</h1>
        <p>Orientações rápidas para a sua cozinha, baseadas em fontes oficiais.</p>
      </header>
      <ul className="guide-grid">
        {GUIDES.map((g) => (
          <li key={g.id}>
            <Link to={`/guias/${g.id}`} className="card guide-card">
              <span className="guide-ico">
                <Icon name={g.icon} size={26} />
              </span>
              <div>
                <h2>{g.title}</h2>
                <p>{g.summary}</p>
              </div>
              <Icon name="arrow" size={18} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Guide() {
  const { id } = useParams();
  const g = getGuide(id);
  useEffect(() => {
    if (g) trackEvent('guide_view', g.id, g.title);
  }, [g]);
  if (!g) return <NotFound />;
  const i = GUIDES.findIndex((x) => x.id === g.id);
  const next = GUIDES[(i + 1) % GUIDES.length];
  return (
    <article className="page prose guide">
      <div className="crumbs">
        <Link to="/guias">Guias</Link> <Icon name="arrow" size={12} /> <span>{g.title}</span>
      </div>
      <header className="page-head">
        <h1>{g.title}</h1>
        <p>{g.summary}</p>
      </header>
      <Blocks blocks={g.blocks} />
      <p className="small">
        Informações educativas; não substituem a orientação de um nutricionista ou da vigilância sanitária da
        sua cidade.
      </p>
      <nav className="pager" aria-label="Outros guias">
        <span />
        <Link to={`/guias/${next.id}`} className="pager-next">
          <small>Próximo guia</small>
          {next.title}
        </Link>
      </nav>
    </article>
  );
}
