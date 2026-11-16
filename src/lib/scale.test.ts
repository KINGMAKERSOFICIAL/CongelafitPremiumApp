import { describe, expect, it } from 'vitest';
import { formatNum, parseNum, scaleIngredient as s } from './scale';

describe('parseNum', () => {
  it('entende frações e decimais', () => {
    expect(parseNum('1/2')).toBe(0.5);
    expect(parseNum('½')).toBe(0.5);
    expect(parseNum('1 e 1/2')).toBe(1.5);
    expect(parseNum('1 1/2')).toBe(1.5);
    expect(parseNum('2 ½')).toBe(2.5);
    expect(parseNum('1,5')).toBe(1.5);
    expect(parseNum('3')).toBe(3);
  });
});

describe('formatNum', () => {
  it('usa frações bonitas e vírgula decimal', () => {
    expect(formatNum(0.5)).toBe('½');
    expect(formatNum(1.5)).toBe('1 ½');
    expect(formatNum(2.25)).toBe('2 ¼');
    expect(formatNum(7.5)).toBe('7 ½');
    expect(formatNum(120)).toBe('120');
    expect(formatNum(1 / 3)).toBe('⅓');
  });
});

describe('scaleIngredient', () => {
  it('multiplica e ajusta o plural', () => {
    expect(s('1 ovo', 2)).toBe('2 ovos');
    expect(s('2 ovos', 0.5)).toBe('1 ovo');
    expect(s('1 colher (sopa) de azeite', 3)).toBe('3 colheres (sopa) de azeite');
    expect(s('3 colheres (sopa) de azeite', 0.5)).toBe('1 ½ colheres (sopa) de azeite');
    expect(s('1 xícara (chá) de farinha', 2)).toBe('2 xícaras (chá) de farinha');
    expect(s('2 dentes de alho', 0.5)).toBe('1 dente de alho');
    expect(s('1 limão', 3)).toBe('3 limões');
  });
  it('escala pesos entre parênteses e no início', () => {
    expect(s('120 g de farinha de amendoim', 2)).toBe('240 g de farinha de amendoim');
    expect(s('1 pé de alface (cerca de 300 g)', 2)).toBe('2 pés de alface (cerca de 600 g)');
    expect(s('3 colheres (sopa) de creme de leite (45 g)', 0.5)).toBe(
      '1 ½ colheres (sopa) de creme de leite (22,5 g)',
    );
    expect(s('15ml de molho shoyu', 2)).toBe('30ml de molho shoyu');
    expect(s('15 ml de azeite', 0.5)).toBe('7,5 ml de azeite');
  });
  it('frações mistas e "e"', () => {
    expect(s('1 e 1/2 xícara (chá) de farinha', 2)).toBe('3 xícaras (chá) de farinha');
    expect(s('1/2 cebola', 2)).toBe('1 cebola');
    expect(s('½ xícara (chá) de leite', 3)).toBe('1 ½ xícaras (chá) de leite');
  });
  it('suco/raspas de N frutas', () => {
    expect(s('Suco de 1 limão', 2)).toBe('Suco de 2 limões');
    expect(s('Raspas de 2 limões', 0.5)).toBe('Raspas de 1 limão');
  });
  it('não mexe no que não tem quantidade', () => {
    expect(s('Sal a gosto', 2)).toBe('Sal a gosto');
    expect(s('Sal e pimenta-do-reino a gosto', 3)).toBe('Sal e pimenta-do-reino a gosto');
    expect(s('1 ovo', 1)).toBe('1 ovo');
  });
  it('não pluraliza abreviações', () => {
    expect(s('50 g de coco ralado', 3)).toBe('150 g de coco ralado');
    expect(s('200 ml de leite', 2)).toBe('400 ml de leite');
  });
  it('converte para kg e litros quando passa de mil', () => {
    expect(s('2 berinjelas (cerca de 500 g)', 2)).toBe(
      '2 berinjelas (cerca de 1 kg)'.replace('2 berinjelas', '4 berinjelas'),
    );
    expect(s('1 caldo (500 ml)', 3)).toBe('3 caldos (1,5 litros)');
  });
  it('litros', () => {
    expect(s('Água fervente (cerca de 1,5 litro) para cobrir', 2)).toBe(
      'Água fervente (cerca de 3 litros) para cobrir',
    );
  });
});
