import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { getRecipe } from '../data';
import { fmtDate } from '../lib/dates';
import { expiryOf, freezeRuleFor, unitText } from '../lib/freezer';
import { useFreezer } from '../lib/hooks';
import { NotFound } from './NotFound';

const base = import.meta.env.BASE_URL;

export function Label() {
  const { id } = useParams();
  const { items } = useFreezer();
  const item = items.find((i) => i.id === id);
  const [copies, setCopies] = useState(() => item?.portions ?? 1);
  if (!item) return <NotFound />;

  const recipe = item.recipeId ? getRecipe(item.recipeId) : undefined;
  const serve = recipe ? freezeRuleFor(recipe).serve : 'reheat';
  const n = Math.min(24, Math.max(1, copies || 1));

  return (
    <div className="page narrow label-page">
      <div className="crumbs noprint">
        <Link to="/freezer">Meu Freezer</Link> <Icon name="arrow" size={12} /> <span>Etiqueta</span>
      </div>
      <header className="page-head noprint">
        <h1>Etiqueta para o pote</h1>
        <p>
          Imprima em papel adesivo ou em folha comum e cole no pote. Cabem 2 etiquetas por linha na folha A4.
        </p>
      </header>

      <div className="label-tools noprint">
        <label htmlFor="copies">Quantas etiquetas?</label>
        <div className="stepper">
          <button
            type="button"
            className="icon-btn sm"
            aria-label="Menos"
            onClick={() => setCopies(Math.max(1, n - 1))}
          >
            <Icon name="minus" size={16} />
          </button>
          <input
            id="copies"
            type="number"
            inputMode="numeric"
            min={1}
            max={24}
            value={copies}
            onChange={(e) => setCopies(Number(e.target.value))}
          />
          <button
            type="button"
            className="icon-btn sm"
            aria-label="Mais"
            onClick={() => setCopies(Math.min(24, n + 1))}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        <button type="button" className="btn" onClick={() => window.print()}>
          <Icon name="printer" size={18} /> Imprimir
        </button>
      </div>

      <div className="label-grid" aria-label="Pré-visualização das etiquetas">
        {Array.from({ length: n }, (_, i) => (
          <article key={i} className="label">
            <header>
              <img src={`${base}icons/logo-mark.png`} alt="" width={36} height={23} />
              <span>
                CONGELA<b>FIT</b>
              </span>
            </header>
            <h2>{item.name}</h2>
            <dl>
              <div>
                <dt>Congelado em</dt>
                <dd>{fmtDate(item.frozenOn)}</dd>
              </div>
              <div>
                <dt>Válido até</dt>
                <dd className="strong">{fmtDate(expiryOf(item))}</dd>
              </div>
              <div>
                <dt>Conteúdo</dt>
                <dd>
                  {item.portions} {unitText(item.unit, item.portions)}
                </dd>
              </div>
            </dl>
            <p className="how">
              {serve === 'reheat'
                ? 'Descongele na geladeira · Aqueça até 74 °C'
                : 'Descongele na geladeira · Sirva gelado'}
            </p>
            <footer>www.congelafit.com.br</footer>
          </article>
        ))}
      </div>
    </div>
  );
}
