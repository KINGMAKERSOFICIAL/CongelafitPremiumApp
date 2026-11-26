import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { RecipePicker } from '../components/RecipePicker';
import { ConfirmSheet } from '../components/Sheet';
import { getRecipe } from '../data';
import { trackEvent } from '../lib/api';
import { addShopRecipe, useShopLines } from '../lib/hooks';
import { formatAmounts, groupBySection, parseLine, shareText, type ShopLine } from '../lib/shopping';
import { shareShoppingList } from '../lib/share';
import { uid } from '../lib/store';
import { toast } from '../lib/toast';

const FACTORS = [0.5, 1, 2, 3, 4];
const factorLabel = (f: number) => (f === 0.5 ? '½×' : `${f}×`);

export function Shopping() {
  const { lines, recipes, checked, open, setRec, setMan, setChk } = useShopLines();
  const [text, setText] = useState('');
  const [pick, setPick] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const groups = useMemo(() => groupBySection(lines), [lines]);
  const message = useMemo(() => shareText(groups, checked), [groups, checked]);

  // O PDF é gerado antes do toque (o menu de compartilhar do celular exige que o envio saia logo após o toque).
  const pdfCache = useRef<{ key: string; blob: Promise<Blob> } | null>(null);
  const pdfFor = (): Promise<Blob> => {
    if (pdfCache.current?.key === message) return pdfCache.current.blob;
    const blob = import('../lib/shoppingPdf').then((m) => m.buildShoppingPdf(groups, checked));
    pdfCache.current = { key: message, blob };
    blob.catch(() => {
      if (pdfCache.current?.blob === blob) pdfCache.current = null;
    });
    return blob;
  };
  useEffect(() => {
    if (lines.length === 0) return;
    const t = setTimeout(() => void pdfFor().catch(() => undefined), 500);
    return () => clearTimeout(t);
  }, [message]);
  const total = lines.length;
  const done = total - open;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const toggle = (key: string) =>
    setChk((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setMan((cur) => [...cur, { id: uid(), text: t.slice(0, 80) }]);
    trackEvent('shopping_update', 'manual', t.slice(0, 80));
    setText('');
  };

  const removeManual = (line: ShopLine) =>
    setMan((cur) => cur.filter((m) => !parseLine(m.text).some((p) => p.key === line.key)));

  return (
    <div className="page">
      <header className="page-head row">
        <div>
          <p className="eyebrow">Lista de compras</p>
          <h1>
            {total === 0
              ? 'Sua lista está vazia'
              : open === 0
                ? 'Tudo comprado!'
                : `${open} ${open === 1 ? 'item' : 'itens'} para comprar`}
          </h1>
          <p>Separada por seção do mercado, com as quantidades somadas de todas as receitas.</p>
        </div>
        <div className="head-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Compartilhar lista de compras"
            disabled={total === 0}
            onClick={() =>
              void shareShoppingList(message, pdfFor()).catch(() =>
                toast('Não foi possível gerar o PDF agora. Tente de novo.'),
              )
            }
          >
            <Icon name="share" />
          </button>
          <button type="button" className="btn" onClick={() => setPick(true)}>
            <Icon name="plus" size={18} /> Receita
          </button>
        </div>
      </header>

      <form className="add-line" onSubmit={add}>
        <label className="sr" htmlFor="shop-add">
          Adicionar item à lista
        </label>
        <input
          id="shop-add"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Adicionar item (ex.: 2 kg de batata)"
          maxLength={80}
          autoComplete="off"
        />
        <button type="submit" className="btn" disabled={!text.trim()}>
          Adicionar
        </button>
      </form>

      {recipes.length > 0 && (
        <details className="shop-recipes" open={recipes.length <= 3}>
          <summary>
            Receitas na lista ({recipes.length}) <Icon name="down" size={16} />
          </summary>
          <ul>
            {recipes.map((r) => {
              const rec = getRecipe(r.id);
              if (!rec) return null;
              return (
                <li key={r.id}>
                  <Link to={`/receita/${rec.id}`}>{rec.title}</Link>
                  <label className="select">
                    <span className="sr">Quantas vezes fazer {rec.title}</span>
                    <select
                      value={FACTORS.includes(r.factor) ? r.factor : ''}
                      onChange={(e) =>
                        setRec((cur) =>
                          cur.map((x) => (x.id === r.id ? { ...x, factor: Number(e.target.value) } : x)),
                        )
                      }
                    >
                      {!FACTORS.includes(r.factor) && <option value="">{r.factor}×</option>}
                      {FACTORS.map((f) => (
                        <option key={f} value={f}>
                          {factorLabel(f)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="icon-btn sm"
                    aria-label={`Tirar ${rec.title} da lista`}
                    onClick={() => setRec((cur) => cur.filter((x) => x.id !== r.id))}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {total > 0 && (
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Itens comprados"
        >
          <div className="bar" style={{ width: `${pct}%` }} />
          <span>
            {done} de {total} comprados
          </span>
        </div>
      )}

      {total === 0 ? (
        <div className="empty-state">
          <Icon name="cart" size={40} />
          <h2>Comece por uma receita</h2>
          <p>
            Adicione receitas e o app soma os ingredientes, agrupa por seção e ignora o que você já tem (água,
            por exemplo). Também dá para digitar itens soltos acima.
          </p>
          <div className="empty-actions">
            <button type="button" className="btn" onClick={() => setPick(true)}>
              <Icon name="plus" size={18} /> Adicionar receita
            </button>
            <Link to="/planner" className="btn ghost">
              Usar o planner da semana
            </Link>
          </div>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.section.id} className="shop-group" aria-labelledby={`sg-${g.section.id}`}>
            <h2 id={`sg-${g.section.id}`}>
              {g.section.name}{' '}
              <small>
                {g.lines.filter((l) => !checked.has(l.key)).length}/{g.lines.length}
              </small>
            </h2>
            <ul>
              {g.lines.map((l) => {
                const on = checked.has(l.key);
                const q = formatAmounts(l);
                return (
                  <li key={l.key} className={on ? 'done' : ''}>
                    <label>
                      <input type="checkbox" checked={on} onChange={() => toggle(l.key)} />
                      <span className="box" aria-hidden="true">
                        <Icon name="check" size={14} />
                      </span>
                      <span className="txt">
                        <b>{l.name}</b>
                        {q && <span className="qty">{q}</span>}
                      </span>
                    </label>
                    {l.manual && (
                      <button
                        type="button"
                        className="icon-btn sm"
                        aria-label={`Remover ${l.name} da lista`}
                        onClick={() => removeManual(l)}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {total > 0 && (
        <div className="toolbar-actions">
          <button type="button" className="btn ghost" onClick={() => setChk(() => [])} disabled={done === 0}>
            <Icon name="reset" size={16} /> Desmarcar tudo
          </button>
          <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={16} /> Esvaziar lista
          </button>
        </div>
      )}

      <p className="small foot-note">
        Quantidades somadas só entre unidades iguais (gramas com gramas, colheres com colheres). Itens “a
        gosto” aparecem sem quantidade. Confira o que você já tem em casa antes de comprar.
      </p>

      <RecipePicker
        open={pick}
        title="Adicionar receita à lista"
        onClose={() => setPick(false)}
        onPick={(r) => {
          setRec((cur) => addShopRecipe(cur, r.id, 1));
          trackEvent('shopping_update', r.id, r.title);
          setPick(false);
          toast(`${r.title} na lista.`);
        }}
      />
      <ConfirmSheet
        open={confirm}
        title="Esvaziar a lista?"
        message="Remove todas as receitas, os itens digitados e as marcações."
        confirmLabel="Esvaziar"
        onNo={() => setConfirm(false)}
        onYes={() => {
          setRec(() => []);
          setMan(() => []);
          setChk(() => []);
          setConfirm(false);
          toast('Lista esvaziada.');
        }}
      />
    </div>
  );
}
