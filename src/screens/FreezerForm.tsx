import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { RecipePicker } from '../components/RecipePicker';
import { getCategory, getRecipe } from '../data';
import { fmtDate, isISO } from '../lib/dates';
import {
  defaultPortions,
  expiryOf,
  freezeRuleFor,
  unitFor,
  unitText,
  type FreezerItem,
  type PortionUnit,
} from '../lib/freezer';
import { useFreezer, useToday } from '../lib/hooks';
import { uid } from '../lib/store';
import { toast } from '../lib/toast';
import type { Recipe } from '../types';
import { NotFound } from './NotFound';

const MONTHS = [1, 2, 3, 4, 6];
const UNITS: PortionUnit[] = ['porção', 'unidade', 'pote'];

export function FreezerForm() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const today = useToday();
  const { items, set } = useFreezer();
  const editing = id ? items.find((i) => i.id === id) : undefined;
  const fromParam = !editing ? getRecipe(sp.get('r') ?? undefined) : undefined;

  const [recipeId, setRecipeId] = useState<string | null>(editing?.recipeId ?? fromParam?.id ?? null);
  const [name, setName] = useState(editing?.name ?? fromParam?.title ?? '');
  const [portions, setPortions] = useState(editing?.portions ?? (fromParam ? defaultPortions(fromParam) : 1));
  const [unit, setUnit] = useState<PortionUnit>(
    editing?.unit ?? (fromParam ? unitFor(fromParam.basis) : 'porção'),
  );
  const [frozenOn, setFrozenOn] = useState(editing?.frozenOn ?? today);
  const [months, setMonths] = useState(editing?.months ?? (fromParam ? freezeRuleFor(fromParam).months : 3));
  const [note, setNote] = useState(editing?.note ?? '');
  const [pick, setPick] = useState(false);
  const [err, setErr] = useState('');

  if (id && !editing) return <NotFound />;

  const recipe = recipeId ? getRecipe(recipeId) : undefined;
  const rule = recipe ? freezeRuleFor(recipe) : null;
  const valid = isISO(frozenOn);
  const expiry = valid ? expiryOf({ frozenOn, months }) : '';

  const choose = (r: Recipe) => {
    setRecipeId(r.id);
    setName(r.title);
    setPortions(defaultPortions(r));
    setUnit(unitFor(r.basis));
    setMonths(freezeRuleFor(r).months);
    setPick(false);
  };

  const save = (e: FormEvent, thenLabel = false) => {
    e.preventDefault();
    if (!name.trim()) return setErr('Dê um nome para o que você congelou.');
    if (!valid) return setErr('Informe a data em que congelou.');
    if (frozenOn > today) return setErr('A data de congelamento não pode ser no futuro.');
    const item: FreezerItem = {
      id: editing?.id ?? uid(),
      recipeId,
      name: name.trim(),
      portions: Math.min(99, Math.max(1, Math.round(portions) || 1)),
      unit,
      frozenOn,
      months,
      note: note.trim(),
    };
    set((cur) => (editing ? cur.map((x) => (x.id === item.id ? item : x)) : [...cur, item]));
    toast(editing ? 'Alterações salvas.' : 'Adicionado ao freezer.');
    nav(thenLabel ? `/freezer/etiqueta/${item.id}` : '/freezer');
  };

  return (
    <div className="page narrow">
      <div className="crumbs">
        <Link to="/freezer">Meu Freezer</Link> <Icon name="arrow" size={12} />{' '}
        <span>{editing ? 'Editar' : 'Congelar'}</span>
      </div>
      <header className="page-head">
        <h1>{editing ? 'Editar item' : 'Registrar no freezer'}</h1>
      </header>

      <form className="form" onSubmit={(e) => save(e)} noValidate>
        <div className="field">
          <label htmlFor="f-name">O que você congelou</label>
          <div className="field-row">
            <input
              id="f-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Lasanha low carb de frango"
              maxLength={120}
              autoComplete="off"
            />
            <button type="button" className="btn ghost sm" onClick={() => setPick(true)}>
              <Icon name="book" size={16} /> Escolher receita
            </button>
          </div>
          {recipe && (
            <p className="hint">
              Receita: <Link to={`/receita/${recipe.id}`}>{recipe.title}</Link> ·{' '}
              {getCategory(recipe.cat)?.name}
              {' · '}
              <button type="button" className="link-btn inline" onClick={() => setRecipeId(null)}>
                desvincular
              </button>
            </p>
          )}
        </div>

        {rule && (
          <div className={`callout ${rule.verdict}`} role="note">
            <Icon name={rule.verdict === 'ok' ? 'shield' : 'warn'} size={20} />
            <div>
              <b>
                {rule.verdict === 'ok' &&
                  `Congela bem · prazo sugerido: ${rule.months} ${rule.months === 1 ? 'mês' : 'meses'}`}
                {rule.verdict === 'caution' &&
                  `Congela com cuidado · prazo sugerido: ${rule.months} ${rule.months === 1 ? 'mês' : 'meses'}`}
                {rule.verdict === 'no' && 'Não costuma congelar bem'}
              </b>
              <p>{rule.note}</p>
            </div>
          </div>
        )}

        <div className="field-grid">
          <div className="field">
            <label htmlFor="f-qty">Quantidade</label>
            <div className="stepper">
              <button
                type="button"
                className="icon-btn sm"
                aria-label="Menos"
                onClick={() => setPortions((p) => Math.max(1, p - 1))}
              >
                <Icon name="minus" size={16} />
              </button>
              <input
                id="f-qty"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={portions}
                onChange={(e) => setPortions(Number(e.target.value))}
              />
              <button
                type="button"
                className="icon-btn sm"
                aria-label="Mais"
                onClick={() => setPortions((p) => Math.min(99, p + 1))}
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-unit">Medido em</label>
            <select id="f-unit" value={unit} onChange={(e) => setUnit(e.target.value as PortionUnit)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitText(u, 2)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-date">Congelado em</label>
            <input
              id="f-date"
              type="date"
              value={frozenOn}
              max={today}
              onChange={(e) => setFrozenOn(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-months">Prazo de qualidade</label>
            <select id="f-months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {(MONTHS.includes(months) ? MONTHS : [...MONTHS, months].sort((a, b) => a - b)).map((m) => (
                <option key={m} value={m}>
                  {m} {m === 1 ? 'mês' : 'meses'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="expiry-line" aria-live="polite">
          {valid ? (
            <>
              Válido até <b>{fmtDate(expiry)}</b>
            </>
          ) : (
            'Informe a data para calcular a validade.'
          )}
        </p>

        <div className="field">
          <label htmlFor="f-note">Observação (opcional)</label>
          <input
            id="f-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: sem sal, com molho à parte"
            maxLength={200}
          />
        </div>

        {err && (
          <p className="form-err" role="alert">
            {err}
          </p>
        )}

        <div className="form-actions">
          <button type="submit" className="btn">
            {editing ? 'Salvar alterações' : 'Adicionar ao freezer'}
          </button>
          <button type="button" className="btn ghost" onClick={(e) => save(e, true)}>
            <Icon name="tag" size={16} /> Salvar e fazer etiqueta
          </button>
          <Link to="/freezer" className="btn ghost">
            Cancelar
          </Link>
        </div>
      </form>

      <RecipePicker
        open={pick}
        title="Qual receita você congelou?"
        onClose={() => setPick(false)}
        onPick={choose}
      />
    </div>
  );
}
