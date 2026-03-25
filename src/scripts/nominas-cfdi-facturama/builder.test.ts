/**
 * builder.test.ts — Tests unitarios para builder.ts
 *
 * Ejecutar:
 *   npx ts-node --test src/scripts/nominas-cfdi-facturama/builder.test.ts
 * o:
 *   node --require ts-node/register --test src/scripts/nominas-cfdi-facturama/builder.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  round2,
  normalizeName,
  normalizeImss,
  buildFolio,
  toIsoDate,
  buildPayrollRequest,
  BuildInput,
} from './builder';
import { ColaboradorInfo, QuincenaData } from '../nominas-cfdi-2021';
import { CfdiConfig } from './config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConcepto(gravado: number, exento: number = 0) {
  return { importe: gravado + exento, gravado, exento };
}

function makeZero() {
  return makeConcepto(0);
}

function makeInfo(overrides: Partial<ColaboradorInfo> = {}): ColaboradorInfo {
  return {
    codigo:  'TST',
    nombre:  'Colaborador Test',
    puesto:  'Empleado',
    rfc:     'TSTE800101ABC',
    jornada: 8,
    salario: 500,
    forma:   'Formal',
    sh:      31.25,
    curp:    'TSTE800101HDFLNS01',
    imss:    '12345678901',
    sbc:     550,
    sd:      18.33,
    ...overrides,
  };
}

function makeQd(overrides: Partial<QuincenaData> = {}): QuincenaData {
  return {
    salario:         makeConcepto(5000),
    comisiones:      makeZero(),
    bonoPuntualidad: makeZero(),
    otrosIngresos:   makeZero(),
    valesDespensa:   makeZero(),
    primaDominical:  makeZero(),
    diasDescanso:    makeZero(),
    horasExtras:     makeZero(),
    primaVacacional: makeZero(),
    aguinaldo:       makeZero(),
    isr:       250,
    imss:      150,
    infonavit: 0,
    subsidio:  0,
    sh:        31.25,
    rawHe:     0,
    totalDesglose: 4600,
    ...overrides,
  };
}

function makeCfg(overrides: Partial<CfdiConfig['employees']['x']> = {}): CfdiConfig {
  return {
    company: {
      sandbox: {
        nameId:               16,
        expeditionPlace:      '97000',
        employerRegistration: '12345678',
      },
      production: {
        nameId:               16,
        expeditionPlace:      '97000',
        employerRegistration: '12345678',
      },
    },
    facturama: {
      sandbox:    { apiKey: 'test', apiSecret: 'test' },
      production: { apiKey: 'test', apiSecret: 'test' },
    },
    employees: {
      TST: {
        startDateLaborRelations: '2019-01-15',
        fiscalRegime:  '605',
        taxZipCode:    '97000',
        contractType:  '01',
        typeOfJourney: '01',
        unionized:     false,
        positionRisk:  '1',
        ...overrides,
      },
    },
  };
}

function makeInput(overrides: {
  info?: Partial<ColaboradorInfo>;
  qd?:  Partial<QuincenaData>;
  qi?:  number;
  cfgOverrides?: Partial<CfdiConfig['employees']['x']>;
} = {}): BuildInput {
  return {
    info: makeInfo(overrides.info),
    qd:   makeQd(overrides.qd),
    qi:   overrides.qi ?? 0,   // Ene Q1
    cfg:  makeCfg(overrides.cfgOverrides),
    env:  'sandbox',
  };
}

// ─── round2 ───────────────────────────────────────────────────────────────────

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    assert.equal(round2(1.006), 1.01);
    assert.equal(round2(1.004), 1);
    assert.equal(round2(123.456789), 123.46);
    assert.equal(round2(0), 0);
    assert.equal(round2(1000), 1000);
    assert.equal(round2(100.005), 100.01); // known JS float edge: 100.005 * 100 = 100.5 exactly
  });
});

// ─── normalizeName ────────────────────────────────────────────────────────────

describe('normalizeName', () => {
  it('converts to uppercase', () => {
    assert.equal(normalizeName('jose'), 'JOSE');
  });

  it('strips accents', () => {
    assert.equal(normalizeName('María'), 'MARIA');
    assert.equal(normalizeName('José'), 'JOSE');
    assert.equal(normalizeName('Héctor'), 'HECTOR');
  });

  it('converts ñ to N', () => {
    assert.equal(normalizeName('Muñoz'), 'MUNOZ');
    assert.equal(normalizeName('PEÑA'), 'PENA');
  });

  it('collapses whitespace', () => {
    assert.equal(normalizeName('  Juan   Pérez  '), 'JUAN PEREZ');
  });

  it('handles combined accents + ñ + case', () => {
    assert.equal(normalizeName('Yolanda Añorve García'), 'YOLANDA ANORVE GARCIA');
  });
});

// ─── normalizeImss ────────────────────────────────────────────────────────────

describe('normalizeImss', () => {
  it('returns 11-digit string as-is', () => {
    assert.equal(normalizeImss('12345678901'), '12345678901');
  });

  it('strips non-numeric characters', () => {
    assert.equal(normalizeImss('123 456 789 01'), '12345678901');
  });

  it('returns undefined for wrong length', () => {
    assert.equal(normalizeImss('1234567890'), undefined);   // 10 digits
    assert.equal(normalizeImss('123456789012'), undefined); // 12 digits
  });

  it('returns undefined for empty string', () => {
    assert.equal(normalizeImss(''), undefined);
  });

  it('handles scientific notation string after Math.round conversion', () => {
    // LFP scenario: imss is "1530000000000000000000" (> 11 digits)
    assert.equal(normalizeImss('153000000000000000000'), undefined);
  });
});

// ─── buildFolio ───────────────────────────────────────────────────────────────

describe('buildFolio', () => {
  it('builds Q1 folio for January (qi=0)', () => {
    assert.equal(buildFolio('AAA', 0), 'AAA-2101Q1');
  });

  it('builds Q2 folio for January (qi=1)', () => {
    assert.equal(buildFolio('AAA', 1), 'AAA-2101Q2');
  });

  it('builds Q1 folio for December (qi=22)', () => {
    assert.equal(buildFolio('TST', 22), 'TST-2112Q1');
  });

  it('builds Q2 folio for December (qi=23)', () => {
    assert.equal(buildFolio('TST', 23), 'TST-2112Q2');
  });

  it('builds correct folio for March Q1 (qi=4)', () => {
    assert.equal(buildFolio('ABC', 4), 'ABC-2103Q1');
  });
});

// ─── toIsoDate ────────────────────────────────────────────────────────────────

describe('toIsoDate', () => {
  it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
    assert.equal(toIsoDate('15/01/2021'), '2021-01-15');
    assert.equal(toIsoDate('31/12/2021'), '2021-12-31');
    assert.equal(toIsoDate('01/06/2021'), '2021-06-01');
  });
});

// ─── buildPayrollRequest ──────────────────────────────────────────────────────

describe('buildPayrollRequest', () => {
  it('returns correct top-level fields', () => {
    const req = buildPayrollRequest(makeInput());
    assert.equal(req.NameId, 16);
    assert.equal(req.ExpeditionPlace, '97000');
    assert.equal(req.CfdiType, 'N');
    assert.equal(req.PaymentMethod, 'PUE');
    assert.equal(req.Serie, 'NOM');
  });

  it('sets folio from code and qi', () => {
    const req = buildPayrollRequest(makeInput({ qi: 0 }));
    assert.equal(req.Folio, 'TST-2101Q1');
  });

  it('uppercases and trims RFC', () => {
    const req = buildPayrollRequest(makeInput({ info: { rfc: ' tste800101abc ' } }));
    assert.equal(req.Receiver.Rfc, 'TSTE800101ABC');
  });

  it('normalizes employee name', () => {
    const req = buildPayrollRequest(makeInput({ info: { nombre: 'Yolanda Muñoz García' } }));
    assert.equal(req.Receiver.Name, 'YOLANDA MUNOZ GARCIA');
  });

  it('sets CfdiUse=CN01', () => {
    const req = buildPayrollRequest(makeInput());
    assert.equal(req.Receiver.CfdiUse, 'CN01');
  });

  it('sets employee CURP', () => {
    const req = buildPayrollRequest(makeInput());
    assert.equal(req.Complemento.Payroll.Employee.Curp, 'TSTE800101HDFLNS01');
  });

  it('includes SocialSecurityNumber when IMSS is 11 digits', () => {
    const req = buildPayrollRequest(makeInput({ info: { imss: '12345678901' } }));
    assert.equal(req.Complemento.Payroll.Employee.SocialSecurityNumber, '12345678901');
  });

  it('omits SocialSecurityNumber when IMSS is invalid', () => {
    const req = buildPayrollRequest(makeInput({ info: { imss: '12345' } }));
    assert.equal(req.Complemento.Payroll.Employee.SocialSecurityNumber, undefined);
  });

  it('sets BaseSalary from sbc', () => {
    const req = buildPayrollRequest(makeInput({ info: { sbc: 550.75 } }));
    assert.equal(req.Complemento.Payroll.Employee.BaseSalary, 550.75);
  });

  it('sets DailySalary from sd', () => {
    const req = buildPayrollRequest(makeInput({ info: { sd: 18.33 } }));
    assert.equal(req.Complemento.Payroll.Employee.DailySalary, 18.33);
  });

  it('sets RegimeType=02', () => {
    const req = buildPayrollRequest(makeInput());
    assert.equal(req.Complemento.Payroll.Employee.RegimeType, '02');
  });

  it('sets FederalEntityKey=YUC', () => {
    const req = buildPayrollRequest(makeInput());
    assert.equal(req.Complemento.Payroll.Employee.FederalEntityKey, 'YUC');
  });

  it('sets FrequencyPayment=04', () => {
    const req = buildPayrollRequest(makeInput());
    assert.equal(req.Complemento.Payroll.Employee.FrequencyPayment, '04');
  });

  // ── DaysPaid ──────────────────────────────────────────────────────────────

  it('sets DaysPaid=15 for Q1 (starts on 1st)', () => {
    const req = buildPayrollRequest(makeInput({ qi: 0 })); // Ene Q1: 01/01-15/01
    assert.equal(req.Complemento.Payroll.DaysPaid, 15);
  });

  it('sets DaysPaid=16 for Jan Q2 (31-15=16)', () => {
    const req = buildPayrollRequest(makeInput({ qi: 1 })); // Ene Q2: 16/01-31/01
    assert.equal(req.Complemento.Payroll.DaysPaid, 16);
  });

  it('sets DaysPaid=13 for Feb Q2 (28-15=13)', () => {
    const req = buildPayrollRequest(makeInput({ qi: 3 })); // Feb Q2: 16/02-28/02
    assert.equal(req.Complemento.Payroll.DaysPaid, 13);
  });

  // ── PaymentDate ───────────────────────────────────────────────────────────

  it('sets PaymentDate to last day of period', () => {
    const req = buildPayrollRequest(makeInput({ qi: 0 })); // Ene Q1 fin=15/01/2021
    assert.equal(req.Complemento.Payroll.PaymentDate, '2021-01-15');
  });

  it('sets InitialPaymentDate to first day', () => {
    const req = buildPayrollRequest(makeInput({ qi: 0 }));
    assert.equal(req.Complemento.Payroll.InitialPaymentDate, '2021-01-01');
  });

  // ── Perceptions ───────────────────────────────────────────────────────────

  it('includes perception 001 (Sueldos) when salario > 0', () => {
    const req = buildPayrollRequest(makeInput({ qd: { salario: makeConcepto(5000) } }));
    const p = req.Complemento.Payroll.Perceptions.Details.find(p => p.PerceptionType === '001');
    assert.ok(p, 'perception 001 should exist');
    assert.equal(p!.TaxedAmount, 5000);
    assert.equal(p!.ExemptAmount, 0);
  });

  it('excludes perception when amount is zero', () => {
    const req = buildPayrollRequest(makeInput({ qd: { comisiones: makeZero() } }));
    const p = req.Complemento.Payroll.Perceptions.Details.find(p => p.PerceptionType === '028');
    assert.equal(p, undefined);
  });

  it('includes perception 028 (Comisiones)', () => {
    const req = buildPayrollRequest(makeInput({ qd: { comisiones: makeConcepto(1000) } }));
    const p = req.Complemento.Payroll.Perceptions.Details.find(p => p.PerceptionType === '028');
    assert.ok(p);
    assert.equal(p!.TaxedAmount, 1000);
  });

  it('includes perception 047 (Vales despensa) with correct amounts', () => {
    const req = buildPayrollRequest(makeInput({ qd: { valesDespensa: makeConcepto(0, 500) } }));
    const p = req.Complemento.Payroll.Perceptions.Details.find(p => p.PerceptionType === '047');
    assert.ok(p);
    assert.equal(p!.TaxedAmount, 0);
    assert.equal(p!.ExemptAmount, 500);
  });

  it('includes perception 019 (Horas extra) with ExtraHours detail', () => {
    const req = buildPayrollRequest(makeInput({
      qd: {
        horasExtras: makeConcepto(200, 200),
        rawHe: 200,
      },
      info: { sh: 31.25 },
    }));
    const p = req.Complemento.Payroll.Perceptions.Details.find(p => p.PerceptionType === '019');
    assert.ok(p, 'perception 019 should exist');
    assert.ok(p!.ExtraHours, 'ExtraHours detail should exist');
    assert.equal(p!.ExtraHours![0]!.HoursType, '01');
    assert.ok(p!.ExtraHours![0]!.Days >= 1);
    assert.ok(p!.ExtraHours![0]!.ExtraHours >= 1);
  });

  it('includes perception 002 (Aguinaldo)', () => {
    const req = buildPayrollRequest(makeInput({ qd: { aguinaldo: makeConcepto(1000, 2000) } }));
    const p = req.Complemento.Payroll.Perceptions.Details.find(p => p.PerceptionType === '002');
    assert.ok(p);
    assert.equal(p!.TaxedAmount, 1000);
    assert.equal(p!.ExemptAmount, 2000);
  });

  // ── Deductions ────────────────────────────────────────────────────────────

  it('includes ISR deduction (002)', () => {
    const req = buildPayrollRequest(makeInput({ qd: { isr: 250 } }));
    const d = req.Complemento.Payroll.Deductions!.Details.find(d => d.DeduccionType === '002');
    assert.ok(d);
    assert.equal(d!.Amount, 250);
  });

  it('includes IMSS deduction (001)', () => {
    const req = buildPayrollRequest(makeInput({ qd: { imss: 150 } }));
    const d = req.Complemento.Payroll.Deductions!.Details.find(d => d.DeduccionType === '001');
    assert.ok(d);
    assert.equal(d!.Amount, 150);
  });

  it('includes Infonavit deduction (010)', () => {
    const req = buildPayrollRequest(makeInput({ qd: { infonavit: 100 } }));
    const d = req.Complemento.Payroll.Deductions!.Details.find(d => d.DeduccionType === '010');
    assert.ok(d);
    assert.equal(d!.Amount, 100);
  });

  it('omits Deductions node when all deductions are 0', () => {
    const req = buildPayrollRequest(makeInput({ qd: { isr: 0, imss: 0, infonavit: 0 } }));
    assert.equal(req.Complemento.Payroll.Deductions, undefined);
  });

  // ── OtherPayments (subsidio) ──────────────────────────────────────────────

  it('includes subsidio when > 0', () => {
    const req = buildPayrollRequest(makeInput({ qd: { subsidio: 300, isr: 0, imss: 0, infonavit: 0 } }));
    const op = req.Complemento.Payroll.OtherPayments?.find(o => o.OtherPaymentType === '002');
    assert.ok(op);
    assert.equal(op!.Amount, 300);
    assert.equal(op!.EmploymentSubsidy?.Amount, 300);
  });

  it('inserts 0.01 placeholder subsidio when RegimeType=02 and subsidio=0', () => {
    const req = buildPayrollRequest(makeInput({ qd: { subsidio: 0 } }));
    const op = req.Complemento.Payroll.OtherPayments?.find(o => o.OtherPaymentType === '002');
    assert.ok(op, 'placeholder should exist');
    assert.equal(op!.Amount, 0.01);
    assert.equal(op!.EmploymentSubsidy?.Amount, 0.01);
  });

  // ── Rounding ──────────────────────────────────────────────────────────────

  it('rounds amounts to 2 decimal places', () => {
    const req = buildPayrollRequest(makeInput({ qd: { isr: 100.005 } }));
    const d = req.Complemento.Payroll.Deductions!.Details.find(d => d.DeduccionType === '002');
    assert.equal(d!.Amount, 100.01);
  });

  // ── Payroll dates ─────────────────────────────────────────────────────────

  it('sets correct dates for December Q2 (qi=23)', () => {
    const req = buildPayrollRequest(makeInput({ qi: 23 })); // Dic Q2: 16/12-31/12
    assert.equal(req.Complemento.Payroll.InitialPaymentDate, '2021-12-16');
    assert.equal(req.Complemento.Payroll.FinalPaymentDate,   '2021-12-31');
    assert.equal(req.Complemento.Payroll.PaymentDate,        '2021-12-31');
    assert.equal(req.Complemento.Payroll.DaysPaid, 16);
  });

  // ── Issuer ────────────────────────────────────────────────────────────────

  it('includes EmployerRegistration in Issuer', () => {
    const req = buildPayrollRequest(makeInput());
    assert.equal(req.Complemento.Payroll.Issuer.EmployerRegistration, '12345678');
  });

  // ── Position (puesto) ─────────────────────────────────────────────────────

  it('uses info.puesto when present', () => {
    const req = buildPayrollRequest(makeInput({ info: { puesto: 'Veterinario' } }));
    assert.equal(req.Complemento.Payroll.Employee.Position, 'Veterinario');
  });

  it('defaults to "Empleado" when puesto is empty', () => {
    const req = buildPayrollRequest(makeInput({ info: { puesto: '' } }));
    assert.equal(req.Complemento.Payroll.Employee.Position, 'Empleado');
  });
});
