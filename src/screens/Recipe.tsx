import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getCategory, getRecipe, recipesOf } from '../data';
import { FavButton } from '../components/RecipeCard';
import { Icon } from '../components/Icon';
import { Photo } from '../components/Photo';
import { Sheet } from '../components/Sheet';
import { WEEKDAYS, fmtDM, todayISO, weekdayIndex } from '../lib/dates';
import { freezeRuleFor } from '../lib/freezer';
import { addShopRecipe, usePlan, useShop } from '../lib/hooks';
import { trackEvent } from '../lib/api';
import { SLOTS, addTo, MAX_PER_SLOT, recipesIn, type Slot } from '../lib/planner';
import { scaleIngredient, formatNum } from '../lib/scale';
import { useMarks } from '../lib/store';
import { toast } from '../lib/toast';
import { basisLabel, plural } from '../lib/text';
import type { Group } from '../types';
import { NotFound } from './NotFound';

const FACTORS = [
  { f: 0.5, label: '½×' },
  { f: 1, label: '1×' },
  { f: 2, label: '2×' },
  { f: 3, label: '3×' },
];

/** Mantém a tela acesa enquanto cozinha (quando o aparelho permite). */
function useWakeLock() {
  const [on, setOn] = useState(false);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  useEffect(() => {
    if (!on || !supported) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
      } catch {
        setOn(false);
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [on, supported]);
  return { on, supported, toggle: () => setOn((v) => !v) };
}

export function Recipe() {
  const { id } = useParams();
  const nav = useNavigate();
  const r = getRecipe(id);
  const [factor, setFactor] = useState(1);
  const wake = useWakeLock();
  const ing = useMarks('ing', r?.id ?? '');
  const done = useMarks('step', r?.id ?? '');
  const shop = useShop();
  const { plan, set: setPlan } = usePlan();
  const [planOpen, setPlanOpen] = useState(false);
  const [planDate, setPlanDate] = useState(todayISO());
  const [planSlot, setPlanSlot] = useState<Slot>('almoco');

  useEffect(() => setFactor(1), [id]);
  useEffect(() => {
    if (r) {
      document.title = `${r.title} · CongelaFit Premium`;
      trackEvent('recipe_view', r.id, r.title);
    }
    return () => {
      document.title = 'CongelaFit Premium';
    };
  }, [r]);

  const groups: Group[] = useMemo(
    () => (r ? (r.groups?.length ? r.groups : [{ label: '', items: r.items }]) : []),
    [r],
  );
  const scaled = useMemo(
    () => groups.map((g) => ({ label: g.label, items: g.items.map((i) => scaleIngredient(i, factor)) })),
    [groups, factor],
  );

  if (!r) return <NotFound />;
  const cat = getCategory(r.cat);
  const siblings = recipesOf(r.cat);
  const pos = siblings.findIndex((x) => x.id === r.id);
  const prev = siblings[pos - 1];
  const next = siblings[pos + 1];

  const rendeN = r.rende ? r.rende.n * factor : null;
  const rendeText =
    r.rende && rendeN ? `${formatNum(rendeN)} ${plural(rendeN, r.rende.one, r.rende.many)}` : null;
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);

  const rule = freezeRuleFor(r);
  const toShopping = () => {
    shop.setRec((cur) => addShopRecipe(cur, r.id, factor));
    trackEvent('shopping_update', r.id, r.title);
    toast(
      `${r.title} na lista de compras${factor !== 1 ? ` (${FACTORS.find((o) => o.f === factor)?.label})` : ''}.`,
      {
        to: '/compras',
        linkLabel: 'Ver lista',
      },
    );
  };
  const openPlan = () => {
    setPlanDate(todayISO());
    setPlanOpen(true);
  };
  const planned = recipesIn(plan, planDate, planSlot);
  const planFull = planned.length >= MAX_PER_SLOT && !planned.includes(r.id);
  const confirmPlan = () => {
    if (!planDate || planFull) return;
    setPlan((cur) => addTo(cur, planDate, planSlot, r.id));
    trackEvent('planner_update', r.id, r.title);
    setPlanOpen(false);
    toast(`${r.title} no planner (${WEEKDAYS[weekdayIndex(planDate)]}, ${fmtDM(planDate)}).`, {
      to: '/planner',
      linkLabel: 'Ver planner',
    });
  };

  let counter = 0;

  return (
    <article className="page recipe" data-recipe-protected="true">
      <div className="recipe-bar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => (history.length > 1 ? nav(-1) : nav('/'))}
          aria-label="Voltar"
        >
          <Icon name="back" />
        </button>
        <div className="recipe-actions">
          <FavButton id={r.id} title={r.title} className="icon-btn" />
        </div>
      </div>

      <div className="recipe-top">
        <div className="recipe-hero">
          <Photo recipe={r} thumb={false} eager />
        </div>

        <div className="recipe-info">
          <header className="recipe-head">
            <div className="tags">
              <span className="num">Nº {String(r.n).padStart(3, '0')}</span>
              {cat && (
                <Link to={`/categoria/${cat.id}`} className="tag">
                  {cat.name}
                </Link>
              )}
            </div>
            <h1>{r.title}</h1>
          </header>

          <div className="stats-row">
            <div className="stat dark">
              <span className="lab">
                <Icon name="flame" size={15} /> Calorias
              </span>
              <b>
                {r.kcal}
                <small> kcal</small>
              </b>
              <span className="sub">{basisLabel(r.basis)} · estimado</span>
            </div>
            <div className="stat">
              <span className="lab">
                <Icon name="utensils" size={15} /> Rende
              </span>
              <b>{rendeText ?? '—'}</b>
              {r.portion && <span className="sub">porção: {r.portion}</span>}
            </div>
            <div className="stat">
              <span className="lab">
                <Icon name="clock" size={15} /> Tempo
              </span>
              <b>{r.time ?? '—'}</b>
              {r.rest && <span className="sub">+ {r.rest} de descanso</span>}
            </div>
          </div>

          <div className="tools">
            <div className="scale" role="group" aria-label="Ajustar porções">
              <span>Porções</span>
              {FACTORS.map((o) => (
                <button
                  key={o.f}
                  type="button"
                  className={`chip ${factor === o.f ? 'on' : ''}`}
                  aria-pressed={factor === o.f}
                  onClick={() => setFactor(o.f)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {wake.supported && (
              <button
                type="button"
                className={`chip wake ${wake.on ? 'on' : ''}`}
                aria-pressed={wake.on}
                onClick={wake.toggle}
              >
                <Icon name="sun" size={16} /> Manter tela acesa
              </button>
            )}
          </div>

          <div className="recipe-cta" role="group" aria-label="Usar esta receita">
            <Link to={`/freezer/novo?r=${r.id}`} className="btn">
              <Icon name="snow" size={18} /> Congelar
            </Link>
            <button type="button" className="btn ghost" onClick={openPlan}>
              <Icon name="calendar" size={18} /> Planejar
            </button>
            <button type="button" className="btn ghost" onClick={toShopping}>
              <Icon name="cart" size={18} /> Lista de compras
            </button>
          </div>
        </div>
      </div>

      <div className="recipe-cols">
        <section className="ingredients" aria-labelledby="h-ing">
          <div className="sec-head">
            <h2 id="h-ing">Ingredientes</h2>
            {ing.list.length > 0 && (
              <button type="button" className="link-btn" onClick={ing.clear}>
                <Icon name="reset" size={14} /> Limpar ({ing.list.length}/{totalItems})
              </button>
            )}
          </div>
          {factor !== 1 && (
            <p className="note">Medidas ajustadas para {FACTORS.find((o) => o.f === factor)?.label}.</p>
          )}
          {scaled.map((g, gi) => (
            <div key={gi} className="ing-group">
              {g.label && <h3>{g.label}</h3>}
              <ul>
                {g.items.map((it) => {
                  const k = counter++;
                  return (
                    <li key={k}>
                      <label className={ing.has(k) ? 'checked' : ''}>
                        <input type="checkbox" checked={ing.has(k)} onChange={() => ing.toggle(k)} />
                        <span className="box" aria-hidden="true">
                          <Icon name="check" size={14} />
                        </span>
                        <span className="txt">{it}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        <section className="steps" aria-labelledby="h-steps">
          <div className="sec-head">
            <h2 id="h-steps">Modo de preparo</h2>
            {done.list.length > 0 && (
              <button type="button" className="link-btn" onClick={done.clear}>
                <Icon name="reset" size={14} /> Limpar ({done.list.length}/{r.steps.length})
              </button>
            )}
          </div>
          {factor !== 1 && (
            <p className="note">
              Os números citados nos passos são os da receita original (1×); ajuste-os se precisar.
            </p>
          )}
          <ol>
            {r.steps.map((s, i) => (
              <li key={i} className={done.has(i) ? 'done' : ''}>
                <button type="button" onClick={() => done.toggle(i)} aria-pressed={done.has(i)}>
                  <span className="n">{done.has(i) ? <Icon name="check" size={15} /> : i + 1}</span>
                  <span className="t">{s}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {r.tip && (
        <aside className="recipe-tip">
          <Icon name="info" size={18} />
          <p>
            <b>Dica CongelaFit.</b> {r.tip}
          </p>
        </aside>
      )}

      <section className={`freeze-card ${rule.verdict}`} aria-labelledby="h-fz">
        <div className="freeze-head">
          <Icon name="snow" size={22} />
          <h2 id="h-fz">Congelamento</h2>
          <span
            className={`pill ${rule.verdict === 'ok' ? 'ok' : rule.verdict === 'caution' ? 'soon' : 'expired'}`}
          >
            {rule.verdict === 'ok'
              ? 'Congela bem'
              : rule.verdict === 'caution'
                ? 'Com cuidado'
                : 'Não indicado'}
          </span>
        </div>
        <p>
          {rule.verdict === 'no' ? (
            <>
              <b>Prefira a geladeira</b> (3 a 4 dias).
            </>
          ) : (
            <>
              Qualidade garantida por até{' '}
              <b>
                {rule.months} {rule.months === 1 ? 'mês' : 'meses'}
              </b>{' '}
              a −18 °C.
            </>
          )}{' '}
          {rule.note}
        </p>
        <p className="small">
          {rule.reheat ? (
            <>
              <b>Para servir.</b> {rule.reheat}
            </>
          ) : rule.serve === 'reheat' ? (
            'Descongele na geladeira e reaqueça até 74 °C no centro (sopas e molhos: até ferver).'
          ) : (
            'Descongele na geladeira e sirva gelado ou em temperatura ambiente.'
          )}{' '}
          <Link to="/guias/validade">Ver prazos por categoria</Link>
        </p>
      </section>

      <p className="small foot-note">
        Calorias estimadas a partir dos ingredientes ({basisLabel(r.basis)}); podem variar conforme as marcas
        usadas.
      </p>

      <nav className="pager" aria-label="Outras receitas da categoria">
        {prev ? (
          <Link to={`/receita/${prev.id}`} className="pager-prev">
            <small>Anterior</small>
            {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/receita/${next.id}`} className="pager-next">
            <small>Próxima</small>
            {next.title}
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <Sheet open={planOpen} onClose={() => setPlanOpen(false)} title="Planejar esta receita">
        <p className="sheet-msg">
          <b>{r.title}</b>
        </p>
        <div className="form">
          <div className="field">
            <label htmlFor="plan-date">Dia</label>
            <input
              id="plan-date"
              type="date"
              value={planDate}
              min={todayISO()}
              onChange={(e) => setPlanDate(e.target.value)}
            />
          </div>
          <fieldset className="field">
            <legend>Refeição</legend>
            <div className="chips filters" role="radiogroup" aria-label="Refeição">
              {SLOTS.map((sl) => (
                <button
                  key={sl.id}
                  type="button"
                  role="radio"
                  aria-checked={planSlot === sl.id}
                  className={`chip ${planSlot === sl.id ? 'on' : ''}`}
                  onClick={() => setPlanSlot(sl.id)}
                >
                  {sl.name}
                </button>
              ))}
            </div>
          </fieldset>
          {planFull && (
            <p className="form-err">Esta refeição já tem {MAX_PER_SLOT} receitas. Escolha outra.</p>
          )}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn ghost" onClick={() => setPlanOpen(false)}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={confirmPlan} disabled={!planDate || planFull}>
            <Icon name="check" size={18} /> Adicionar
          </button>
        </div>
      </Sheet>
    </article>
  );
}
