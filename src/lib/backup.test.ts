import { describe, expect, it } from 'vitest';
import { backupFileName, buildBackup, isBackupKey, parseBackup } from './backup';

describe('backup', () => {
  it('só aceita as chaves do app', () => {
    for (const k of [
      'fav',
      'fz',
      'plan',
      'shop.rec',
      'shop.man',
      'shop.chk',
      'prefs',
      'ing:lasanha-low-carb',
      'step:x-1',
    ]) {
      expect(isBackupKey(k)).toBe(true);
    }
    for (const k of ['token', 'ing:', '../x', 'shop', 'fz2']) expect(isBackupKey(k)).toBe(false);
  });
  it('ida e volta', () => {
    const b = buildBackup({ fav: '["a"]', fz: '[]', lixo: '1' }, new Date('2026-11-16T12:00:00Z'));
    expect(Object.keys(b.data).sort()).toEqual(['fav', 'fz']);
    const r = parseBackup(JSON.stringify(b));
    expect(r).toEqual({ ok: true, data: { fav: '["a"]', fz: '[]' }, count: 2 });
  });
  it('recusa arquivos que não são do app ou estão quebrados', () => {
    expect(parseBackup('não é json').ok).toBe(false);
    expect(parseBackup('{"app":"outro","version":1,"data":{}}').ok).toBe(false);
    expect(parseBackup('{"app":"congelafit-premium","version":99,"data":{}}').ok).toBe(false);
    expect(parseBackup('{"app":"congelafit-premium","version":1}').ok).toBe(false);
  });
  it('ignora só a chave com valor corrompido', () => {
    const r = parseBackup(
      JSON.stringify({
        app: 'congelafit-premium',
        version: 1,
        data: { fav: '["a"]', fz: '{quebrado', hack: '1' },
      }),
    );
    expect(r).toEqual({ ok: true, data: { fav: '["a"]' }, count: 1 });
  });
  it('nomeia o arquivo com a data', () => {
    expect(backupFileName(new Date(2026, 10, 5))).toBe('congelafit-backup-2026-11-05.json');
  });
});
