import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { imgUrl } from '../components/Photo';
import { RecipePicker } from '../components/RecipePicker';
import { ConfirmSheet, Sheet } from '../components/Sheet';
import { RECIPES, getRecipe } from '../data';
import { WEEKDAYS, addDays, fmtDM, startOfWeek } from '../lib/dates';
import { ensureShopRecipe, usePlan, useShop, useToday } from '../lib/hooks';
import {
  GOALS,
  SLOTS,
  addTo,
  clearWeek,
  dayKcal,
  generateWeek,
  recipesIn,
  removeFrom,
  weekDays,
  weekRecipeCounts,
  type Goal,
  type Slot,
} from '../lib/planner';
import { shareOrWhatsApp } from '../lib/share';
import { useFavorites } from '../lib/store';
import { toast } from '../lib/toast';
import { basisLabel } from '../lib/text';

export function Planner() {
  const today = useToday();
  const { plan, set } = usePlan();
  const shop = useShop();
  const fav = useFavorites();
  const thisWeek = startOfWeek(today);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [picker, setPicker] = useState<{ date: string; slot: Slot } | null>(null);
  const [auto, setAuto] = useState(false);
  const [goal, setGoal] = useState<Goal>('equilibrado');
  const [confirmClear, setConfirmClear] = useState(false);

  const days = weekDays(weekStart);
  const isCurrent = weekStart === thisWeek;
  const fromDate = days.includes(today) ? today : weekStart < today ? addDays(weekStart, 7) : weekStart;
  const counts = useMemo(() => weekRecipeCounts(plan, weekStart, fromDate), [plan, weekStart, fromDate]);
  const total = useMemo(() => weekRecipeCounts(plan, weekStart).size, [plan, weekStart]);

  useEffect(() => {
    if (!isCurrent) return;
    document.getElementById(`dia-${today}`)?.scrollIntoView({ block: 'start' });
  }, [isCurrent, today]);

  const build = () => {
    const res = generateWeek(plan, {
      weekStart,
      goal,
      recipes: RECIPES,
      favorites: fav.list,
      fromDate: days.includes(today) ? today : undefined,
      variation: Math.floor(Math.random() * 1_000_000),
    });
    set(() => res.plan);
    setAuto(false);
    toast(
      res.added
        ? `Cardápio montado: ${res.added} receitas adicionadas.`
        : 'Todas as refeições já estão preenchidas.',
    );
  };

  const toShopping = () => {
    if (counts.size === 0) return toast('Planeje algumas receitas primeiro.');
    shop.setRec((cur) => [...counts].reduce((acc, [id, n]) => ensureShopRecipe(acc, id, n), cur));
    toast(`${counts.size} receitas na lista de compras.`, { to: '/compras', linkLabel: 'Ver lista' });
  };

  const share = () => {
    const lines = [`*Planner · semana de ${fmtDM(weekStart)} a ${fmtDM(addDays(weekStart, 6))}*`];
    days.forEach((d, i) => {
      const parts = SLOTS.flatMap((s) => {
        const names = recipesIn(plan, d, s.id).map((id) => getRecipe(id)?.title ?? '');
        return names.length ? [`  ${s.name}: ${names.join(' + ')}`] : [];
      });
      if (parts.length) lines.push('', `*${WEEKDAYS[i]} ${fmtDM(d)}*`, ...parts);
    });
    lines.push('', 'CongelaFit Premium · www.congelafit.com.br');
    void shareOrWhatsApp('Planner da semana', lines.join('\n'));
  };

  return (
    <div className="page">
      <header className="page-head row">
        <div>
          <p className="eyebrow">Planner</p>
          <h1>
            {fmtDM(weekStart)} a {fmtDM(addDays(weekStart, 6))}
          </h1>
          <p>
            {total === 0
              ? 'Planeje suas refeições da semana e gere a lista de compras com um toque.'
              : `${total} ${total === 1 ? 'receita planejada' : 'receitas planejadas'} nesta semana.`}
          </p>
        </div>
        <div className="week-nav" role="group" aria-label="Trocar de semana">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Semana anterior"
          >
            <Icon name="back" />
          </button>
          <button type="button" className="chip" onClick={() => setWeekStart(thisWeek)} disabled={isCurrent}>
            Hoje
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Próxima semana"
          >
            <Icon name="arrow" />
          </button>
        </div>
      </header>

      <div className="toolbar-actions">
        <button type="button" className="btn" onClick={() => setAuto(true)}>
          <Icon name="spark" size={18} /> Montar cardápio
        </button>
        <button type="button" className="btn ghost" onClick={toShopping}>
          <Icon name="cart" size={18} /> Lista de compras da semana
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={share}
          aria-label="Compartilhar a semana"
          disabled={total === 0}
        >
          <Icon name="share" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setConfirmClear(true)}
          aria-label="Limpar a semana"
          disabled={total === 0}
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="days">
        {days.map((d, i) => {
          const kcal = dayKcal(plan, d, getRecipe);
          return (
            <section
              key={d}
              id={`dia-${d}`}
              className={`day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`}
              aria-labelledby={`h-${d}`}
            >
              <header>
                <h2 id={`h-${d}`}>
                  {WEEKDAYS[i]} <small>{fmtDM(d)}</small>
                  {d === today && <span className="pill ok">hoje</span>}
                </h2>
                {kcal > 0 && <span className="day-kcal">≈ {kcal} kcal</span>}
              </header>
              {SLOTS.map((s) => {
                const ids = recipesIn(plan, d, s.id);
                return (
                  <div key={s.id} className="slot">
                    <h3>{s.name}</h3>
                    <ul>
                      {ids.map((id) => {
                        const r = getRecipe(id);
                        if (!r) return null;
                        return (
                          <li key={id}>
                            <Link to={`/receita/${r.id}`} className="slot-recipe">
                              {r.img ? (
                                <img
                                  src={imgUrl(r.img, true)}
                                  alt=""
                                  width={56}
                                  height={36}
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <span className="thumb-empty" aria-hidden="true" />
                              )}
                              <span>
                                <b>{r.title}</b>
                                <small>
                                  {r.kcal} kcal {basisLabel(r.basis)}
                                </small>
                              </span>
                            </Link>
                            <button
                              type="button"
                              className="icon-btn sm"
                              aria-label={`Tirar ${r.title} de ${s.name} (${WEEKDAYS[i]})`}
                              onClick={() => set((cur) => removeFrom(cur, d, s.id, id))}
                            >
                              <Icon name="close" size={16} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      className="add-slot"
                      onClick={() => setPicker({ date: d, slot: s.id })}
                    >
                      <Icon name="plus" size={15} /> Adicionar
                      <span className="sr">
                        {' '}
                        em {s.name} de {WEEKDAYS[i]}
                      </span>
                    </button>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <p className="small foot-note">
        As calorias do dia somam uma porção (ou unidade) de cada receita planejada e são estimativas. O que
        você planeja aqui vira lista de compras com as quantidades de cada receita (1× por vez em que ela
        aparece).
      </p>

      <RecipePicker
        open={picker !== null}
        title={
          picker
            ? `${SLOTS.find((s) => s.id === picker.slot)?.name} · ${WEEKDAYS[days.indexOf(picker.date)]} ${fmtDM(picker.date)}`
            : ''
        }
        onClose={() => setPicker(null)}
        onPick={(r) => {
          if (picker) set((cur) => addTo(cur, picker.date, picker.slot, r.id));
          setPicker(null);
          toast(`${r.title} adicionada.`);
        }}
      />

      <Sheet open={auto} onClose={() => setAuto(false)} title="Montar cardápio da semana">
        <p className="sheet-msg">
          Escolha o estilo. O app completa só as refeições vazias, sem repetir receita, e você troca o que
          quiser.
        </p>
        <div className="radio-cards" role="radiogroup" aria-label="Estilo do cardápio">
          {GOALS.map((g) => (
            <label key={g.id} className={`radio-card ${goal === g.id ? 'on' : ''}`}>
              <input
                type="radio"
                name="goal"
                value={g.id}
                checked={goal === g.id}
                onChange={() => setGoal(g.id)}
              />
              <b>{g.name}</b>
              <span>{g.hint}</span>
            </label>
          ))}
        </div>
        {fav.list.length > 0 && <p className="small">Suas receitas favoritas têm prioridade na escolha.</p>}
        <div className="sheet-actions">
          <button type="button" className="btn ghost" onClick={() => setAuto(false)}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={build}>
            <Icon name="spark" size={18} /> Montar
          </button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmClear}
        title="Limpar a semana?"
        message="Todas as refeições planejadas desta semana serão removidas."
        confirmLabel="Limpar"
        onNo={() => setConfirmClear(false)}
        onYes={() => {
          set((cur) => clearWeek(cur, weekStart));
          setConfirmClear(false);
          toast('Semana limpa.');
        }}
      />
    </div>
  );
}
