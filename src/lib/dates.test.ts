import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  fmtDate,
  isISO,
  relativeDays,
  startOfWeek,
  weekdayIndex,
} from './dates';

describe('dates', () => {
  it('soma dias atravessando mês, ano e bissexto', () => {
    expect(addDays('2026-11-16', 1)).toBe('2026-11-17');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('soma meses sem pular para o mês seguinte', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-16', 3)).toBe('2027-02-16');
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15');
    expect(addMonths('2026-05-31', 1)).toBe('2026-06-30');
  });
  it('conta dias entre datas (sem se perder no horário de verão)', () => {
    expect(daysBetween('2026-11-16', '2026-11-16')).toBe(0);
    expect(daysBetween('2026-11-16', '2026-12-16')).toBe(30);
    expect(daysBetween('2026-12-16', '2026-11-16')).toBe(-30);
    expect(daysBetween('2026-03-01', '2026-11-01')).toBe(245);
  });
  it('acha a segunda-feira da semana', () => {
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16'); // segunda
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16'); // domingo
    expect(startOfWeek('2026-11-18')).toBe('2026-11-16');
    expect(weekdayIndex('2026-11-16')).toBe(0);
    expect(weekdayIndex('2026-11-22')).toBe(6);
  });
  it('valida e formata', () => {
    expect(isISO('2026-02-30')).toBe(false);
    expect(isISO('2026-2-3')).toBe(false);
    expect(isISO('2026-02-28')).toBe(true);
    expect(fmtDate('2026-11-05')).toBe('05/11/2026');
    expect(relativeDays(0)).toBe('hoje');
    expect(relativeDays(1)).toBe('amanhã');
    expect(relativeDays(12)).toBe('em 12 dias');
    expect(relativeDays(-3)).toBe('há 3 dias');
  });
});
