import { describe, expect, it } from 'vitest';
import { RECIPES, allIngredients } from '../data';
import { aggregate, classify, formatAmounts, groupBySection, parseLine, shareText } from './shopping';

const one = (l: string) => parseLine(l)[0];

describe('shopping: ler ingredientes', () => {
  it('quantidade + unidade + nome', () => {
    expect(one('2 colheres (sopa) de azeite (30 ml)')).toMatchObject({
      key: 'azeite de oliva',
      qty: 2,
      unit: 'csopa',
    });
    expect(one('1 e 1/2 xícara (chá) de farinha de amêndoas')).toMatchObject({
      key: 'farinha de amendoa',
      qty: 1.5,
      unit: 'xch',
    });
    expect(one('1/4 de xícara (chá) de leite')).toMatchObject({ key: 'leite', qty: 0.25, unit: 'xch' });
    expect(one('1 colher (sopa) cheia de liga neutra')).toMatchObject({ key: 'liga neutra', unit: 'csopa' });
    expect(one('2 dentes de alho picados')).toMatchObject({ key: 'alho', qty: 2, unit: 'dente' });
    expect(one('1 maço grande de espinafre, cozido e picado')).toMatchObject({
      key: 'espinafre',
      unit: 'maco',
    });
  });
  it('converte kg e litros para g e ml', () => {
    expect(one('1,5 kg de patinho')).toMatchObject({ qty: 1500, unit: 'g' });
    expect(one('2 litros de leite')).toMatchObject({ qty: 2000, unit: 'ml' });
  });
  it('contagem simples e variações do mesmo ingrediente', () => {
    expect(one('3 ovos')).toMatchObject({ key: 'ovo', qty: 3, unit: 'un' });
    expect(one('1 clara')).toMatchObject({ key: 'ovo', unit: 'un' });
    expect(one('2 cenouras médias em cubos (200 g)')).toMatchObject({ key: 'cenoura', qty: 2 });
    expect(one('Suco de 1 limão')).toMatchObject({ key: 'limao', qty: 1, unit: 'un' });
    expect(one('Raspas da casca de ½ limão')).toMatchObject({ key: 'limao', qty: 0.5 });
    expect(one('2 a 3 colheres (sopa) de adoçante')).toMatchObject({ qty: 3 });
  });
  it('"a gosto" não tem quantidade e listas são separadas', () => {
    expect(one('Sal a gosto')).toMatchObject({ key: 'sal', qty: null });
    expect(parseLine('Salsinha, cebolinha, pimenta-do-reino e sal a gosto').map((p) => p.key)).toEqual([
      'salsinha',
      'cebolinha',
      'pimenta do reino',
      'sal',
    ]);
  });
  it('não lista o que não se compra', () => {
    expect(parseLine('1 xícara (chá) de água')).toEqual([]);
    expect(parseLine('Água fervente para cozinhar (cerca de 1 litro)')).toEqual([]);
    expect(parseLine('6 cubos de gelo')).toEqual([]);
    expect(parseLine('1 receita de leite condensado diet (veja o capítulo Docinhos e Biscoitos)')).toEqual(
      [],
    );
    expect(one('200 ml de água de coco')).toMatchObject({ key: 'agua de coco' });
  });
  it('mantém o que muda o produto', () => {
    expect(one('300 g de carne moída (patinho)').key).toBe('carne moida');
    expect(one('1 colher (sopa) de leite em pó')).toMatchObject({ key: 'leite em po' });
    expect(one('200 ml de leite sem lactose')).toMatchObject({ key: 'leite sem lactose' });
    expect(one('3 colheres (sopa) de coco ralado')).toMatchObject({ key: 'coco ralado' });
  });
});

describe('shopping: somar e separar por seção', () => {
  const lines = aggregate(
    [
      {
        id: 'a',
        factor: 1,
        lines: [
          '3 ovos',
          '200 g de peito de frango',
          '1 cebola picada',
          '2 dentes de alho',
          'Sal a gosto',
          '1 colher (sopa) de azeite',
        ],
      },
      {
        id: 'b',
        factor: 2,
        lines: [
          '2 ovos',
          '300 g de peito de frango',
          '½ cebola',
          '1 colher (sopa) de azeite',
          '1 colher (chá) de azeite',
          '1 kg de batata',
        ],
      },
      { id: 'c', factor: 1, lines: ['1 kg de batata', 'Sal e pimenta a gosto', '1 clara'] },
    ],
    [{ id: 'm', text: 'papel toalha' }],
  );
  const by = (name: string) => lines.find((l) => l.name === name)!;

  it('soma unidades iguais e multiplica pelo fator da receita', () => {
    expect(formatAmounts(by('Ovos'))).toBe('8 un.'); // 3 + 2×2 + 1
    expect(formatAmounts(by('Peito de frango'))).toBe('800 g');
    expect(formatAmounts(by('Batata'))).toBe('3 kg');
    expect(formatAmounts(by('Cebola'))).toBe('2 un.'); // 1 + ½×2
  });
  it('não mistura unidades diferentes', () => {
    expect(formatAmounts(by('Azeite de oliva'))).toBe('3 colheres (sopa) + 2 colheres (chá)');
  });
  it('item inteiro sobe para o próximo inteiro', () => {
    const l = aggregate([
      { id: 'a', factor: 1, lines: ['½ cebola', '1 dente de alho'] },
      { id: 'b', factor: 1, lines: ['½ cebola', '½ cebola'] },
    ]);
    expect(formatAmounts(l.find((x) => x.key === 'cebola')!)).toBe('2 un.');
  });
  it('"a gosto" aparece junto, sem inventar número', () => {
    expect(formatAmounts(by('Sal'))).toBe('a gosto');
    expect(by('Sal').recipes).toEqual(['a', 'c']);
  });
  it('itens digitados à mão entram na lista', () => {
    const m = by('Papel toalha');
    expect(m.manual).toBe(true);
    expect(formatAmounts(m)).toBe('');
  });
  it('agrupa por seção na ordem do mercado', () => {
    const g = groupBySection(lines).map((x) => x.section.id);
    expect(g).toEqual(['hortifruti', 'acougue', 'laticinios', 'conservas', 'temperos', 'outros']);
  });
  it('gera o texto para WhatsApp sem o que já foi comprado', () => {
    const t = shareText(groupBySection(lines), new Set(['ovo']));
    expect(t).toContain('*Hortifrúti*');
    expect(t).toContain('• Peito de frango — 800 g');
    expect(t).not.toContain('Ovos');
    expect(t).toContain('https://congelafit.store/?utm_source=app');
    expect(t).toContain('CongelaFit Premium');
  });
  it('lata vai para conservas mesmo sendo ervilha/milho', () => {
    const l = aggregate([{ id: 'a', factor: 1, lines: ['1 lata de ervilha', '2 latas de milho verde'] }]);
    expect(l.every((x) => x.section === 'conservas')).toBe(true);
  });
});

describe('shopping: as 396 receitas', () => {
  const all = RECIPES.flatMap((r) => allIngredients(r));
  it('lê todas as linhas sem quebrar e quase tudo tem seção', () => {
    let items = 0;
    let outros = 0;
    for (const l of all) {
      for (const p of parseLine(l)) {
        items++;
        expect(p.name.length).toBeGreaterThan(0);
        expect(p.key).not.toMatch(/^\d/);
        if (classify(p.key) === 'outros') outros++;
      }
    }
    expect(items).toBeGreaterThan(2800);
    expect(outros / items).toBeLessThan(0.005);
  });
  it('cada receita vira uma lista coerente', () => {
    for (const r of RECIPES) {
      const lines = aggregate([{ id: r.id, factor: 1, lines: allIngredients(r) }]);
      expect(lines.length, r.title).toBeGreaterThan(0);
      for (const l of lines) {
        for (const a of l.amounts) expect(a.qty, `${r.title}: ${l.name}`).toBeGreaterThan(0);
      }
    }
  });
  it('uma semana inteira junta repetidos', () => {
    const sources = RECIPES.slice(0, 30).map((r) => ({ id: r.id, factor: 1, lines: allIngredients(r) }));
    const lines = aggregate(sources);
    const keys = lines.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    const total = sources.reduce((n, s) => n + s.lines.length, 0);
    expect(lines.length).toBeLessThan(total);
  });
});
