import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmSheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { imgUrl } from '../components/Photo';
import { getRecipe } from '../data';
import { fmtDate } from '../lib/dates';
import {
  STATUS_LABEL,
  addOne,
  consumeOne,
  expiryOf,
  sortFifo,
  statusOf,
  statusText,
  summarize,
  unitText,
  type FreezerItem,
} from '../lib/freezer';
import { useFreezer, useToday } from '../lib/hooks';
import { toast } from '../lib/toast';

type Filter = 'all' | 'soon' | 'expired';

function ItemCard({
  it,
  today,
  onEat,
  onAdd,
  onDelete,
}: {
  it: FreezerItem;
  today: string;
  onEat: () => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const status = statusOf(it, today);
  const recipe = it.recipeId ? getRecipe(it.recipeId) : undefined;
  return (
    <li className={`fz-item ${status}`}>
      <div className="fz-photo" aria-hidden="true">
        {recipe?.img ? (
          <img src={imgUrl(recipe.img, true)} alt="" width={96} height={62} loading="lazy" decoding="async" />
        ) : (
          <Icon name="snow" size={28} />
        )}
      </div>
      <div className="fz-main">
        <h3>{recipe ? <Link to={`/receita/${recipe.id}`}>{it.name}</Link> : it.name}</h3>
        <p className="fz-qty">
          <b>
            {it.portions} {unitText(it.unit, it.portions)}
          </b>{' '}
          · congelado em {fmtDate(it.frozenOn)}
        </p>
        <p className="fz-exp">
          <span className={`pill ${status}`}>{STATUS_LABEL[status]}</span>
          <span>
            válido até <b>{fmtDate(expiryOf(it))}</b> · {statusText(it, today)}
          </span>
        </p>
        {it.note && <p className="small">{it.note}</p>}
      </div>
      <div className="fz-actions">
        <button type="button" className="chip" onClick={onEat} aria-label={`Comi uma porção de ${it.name}`}>
          <Icon name="minus" size={15} /> Comi 1
        </button>
        <button type="button" className="chip" onClick={onAdd} aria-label={`Somar uma porção de ${it.name}`}>
          <Icon name="plus" size={15} /> 1
        </button>
        <Link className="chip" to={`/freezer/etiqueta/${it.id}`}>
          <Icon name="tag" size={15} /> Etiqueta
        </Link>
        <Link className="chip" to={`/freezer/editar/${it.id}`}>
          <Icon name="edit" size={15} /> Editar
        </Link>
        <button type="button" className="chip" onClick={onDelete} aria-label={`Excluir ${it.name}`}>
          <Icon name="trash" size={15} />
        </button>
      </div>
    </li>
  );
}

export function Freezer() {
  const today = useToday();
  const { items, set } = useFreezer();
  const [filter, setFilter] = useState<Filter>('all');
  const [del, setDel] = useState<FreezerItem | null>(null);

  const sorted = useMemo(() => sortFifo(items), [items]);
  const sum = summarize(items, today);
  const list = sorted.filter((it) => {
    if (filter === 'all') return true;
    const s = statusOf(it, today);
    return filter === 'soon' ? s === 'soon' : s === 'expired';
  });

  return (
    <div className="page">
      <header className="page-head row">
        <div>
          <p className="eyebrow">Meu Freezer</p>
          <h1>O que está congelado</h1>
          <p>Ordenado pelo que vence primeiro: é só pegar de cima para baixo.</p>
        </div>
        <div className="head-actions">
          <Link to="/freezer/novo" className="btn">
            <Icon name="plus" size={18} /> Congelar
          </Link>
        </div>
      </header>

      <ul className="stats-row four" aria-label="Resumo do freezer">
        <li className="stat dark">
          <span className="lab">Itens</span>
          <b>{sum.items}</b>
          <span className="sub">{sum.portions} porções no total</span>
        </li>
        <li className="stat">
          <span className="lab">No prazo</span>
          <b>{sum.items - sum.soon - sum.expired}</b>
        </li>
        <li className={`stat ${sum.soon ? 'warn' : ''}`}>
          <span className="lab">Consumir logo</span>
          <b>{sum.soon}</b>
        </li>
        <li className={`stat ${sum.expired ? 'bad' : ''}`}>
          <span className="lab">Passou do prazo</span>
          <b>{sum.expired}</b>
        </li>
      </ul>

      {items.length > 0 && (
        <div className="chips filters" role="group" aria-label="Filtrar">
          {(
            [
              ['all', `Todos (${sum.items})`],
              ['soon', `Consumir logo (${sum.soon})`],
              ['expired', `Passou do prazo (${sum.expired})`],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              className={`chip ${filter === f ? 'on' : ''}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <Icon name="snow" size={40} />
          <h2>Seu freezer está vazio</h2>
          <p>
            Registre o que você congelou e o app calcula a validade, avisa o que consumir primeiro e imprime a
            etiqueta.
          </p>
          <div className="empty-actions">
            <Link to="/freezer/novo" className="btn">
              <Icon name="plus" size={18} /> Congelar uma receita
            </Link>
            <Link to="/guias/validade" className="btn ghost">
              Ver prazos por categoria
            </Link>
          </div>
        </div>
      ) : list.length === 0 ? (
        <p className="empty">Nada aqui. Que bom: nenhum item neste filtro.</p>
      ) : (
        <ul className="fz-list">
          {list.map((it) => (
            <ItemCard
              key={it.id}
              it={it}
              today={today}
              onEat={() => {
                const last = it.portions <= 1;
                set((cur) => consumeOne(cur, it.id));
                toast(
                  last ? `${it.name}: acabou! Saiu do freezer.` : `${it.name}: restam ${it.portions - 1}.`,
                );
              }}
              onAdd={() => set((cur) => addOne(cur, it.id))}
              onDelete={() => setDel(it)}
            />
          ))}
        </ul>
      )}

      <p className="small foot-note">
        Os prazos são de <b>qualidade</b> (sabor e textura) a −18 °C e são estimativas conservadoras baseadas
        em tabelas do USDA e de universidades; podem ser ajustados em cada item. Alimento mantido sempre a −18
        °C continua seguro por mais tempo, mas perde qualidade.{' '}
        <Link to="/guias/validade">Ver prazos e fontes</Link>.
      </p>

      <ConfirmSheet
        open={del !== null}
        title="Excluir do freezer?"
        message={
          del
            ? `“${del.name}” (${del.portions} ${unitText(del.unit, del.portions)}) será removido da lista.`
            : ''
        }
        confirmLabel="Excluir"
        onNo={() => setDel(null)}
        onYes={() => {
          if (del) set((cur) => cur.filter((x) => x.id !== del.id));
          setDel(null);
          toast('Item excluído.');
        }}
      />
    </div>
  );
}
