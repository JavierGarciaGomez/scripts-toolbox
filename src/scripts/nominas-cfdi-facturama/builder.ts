/**
 * builder.ts — Construye FacturamaPayrollRequest desde datos del Desglose/Catalogo.
 *
 * Mapa de conceptos (SAT c_TipoPercepcion):
 *   001 Sueldos → salario
 *   002 Aguinaldo → aguinaldo
 *   010 Premios puntualidad → bonoPuntualidad
 *   019 Horas extra → horasExtras (+ ExtraHours detail)
 *   020 Prima dominical → primaDominical
 *   021 Prima vacacional → primaVacacional
 *   028 Comisiones → comisiones
 *   038 Otros ingresos → otrosIngresos
 *   029 Vales de despensa → valesDespensa
 *   055 Días descanso laborados → diasDescanso
 *
 * Mapa deducciones (SAT c_TipoDeduccion):
 *   001 Seguridad social → imss
 *   002 ISR → isr
 *   010 Crédito de vivienda → infonavit
 *
 * Otros pagos:
 *   002 Subsidio al empleo → subsidio (+ EmploymentSubsidy)
 */

import { ColaboradorInfo, QuincenaData, QUINCENAS } from '../nominas-cfdi-2021';
import { CfdiConfig, CFDI_DEFAULTS, getEmployeeConfig } from './config';
import {
  FacturamaPayrollRequest,
  FacturamaPerception,
  FacturamaDeduction,
  FacturamaOtherPayment,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Normaliza nombre para SAT: mayúsculas, sin acentos en vocales, conserva Ñ. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[áàäâÁÀÄÂ]/g, 'A')
    .replace(/[éèëêÉÈËÊ]/g, 'E')
    .replace(/[íìïîÍÌÏÎ]/g, 'I')
    .replace(/[óòöôÓÒÖÔ]/g, 'O')
    .replace(/[úùüûÚÙÜÛ]/g, 'U')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Valida IMSS (11 dígitos numéricos). */
export function normalizeImss(raw: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 ? digits : undefined;
}

/** Folio: {CODE}-{YY}{MM}Q{1|2} — formato del sistema HVP. */
export function buildFolio(code: string, qi: number): string {
  const month = String(Math.floor(qi / 2) + 1).padStart(2, '0');
  const q = (qi % 2) + 1;
  return `${code}-21${month}Q${q}`;
}

/** Fecha YYYY-MM-DD desde string DD/MM/YYYY. */
export function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}

/** Construye una percepción si el importe > 0, si no retorna null. */
function mkPerception(
  type: string, code: string, desc: string,
  taxed: number, exempt: number
): FacturamaPerception | null {
  const t = round2(taxed);
  const e = round2(exempt);
  if (t + e <= 0) return null;
  return { PerceptionType: type, Code: code, Description: desc, TaxedAmount: t, ExemptAmount: e };
}

/** Construye una deducción si el monto > 0, si no retorna null. */
function mkDeduction(type: string, code: string, desc: string, amount: number): FacturamaDeduction | null {
  const a = round2(amount);
  if (a <= 0) return null;
  return { DeduccionType: type, Code: code, Description: desc, Amount: a };
}

// ─── Builder principal ────────────────────────────────────────────────────────

export interface BuildInput {
  info: ColaboradorInfo;
  qd:   QuincenaData;
  qi:   number;         // índice de quincena (0-23)
  cfg:  CfdiConfig;
  env:  'sandbox' | 'production';
}

export function buildPayrollRequest(input: BuildInput): FacturamaPayrollRequest {
  const { info, qd, qi, cfg, env } = input;
  const q = QUINCENAS[qi]!;
  const company = cfg.company[env];
  const empCfg = getEmployeeConfig(cfg, info.codigo, env);

  // ── Perceptions ───────────────────────────────────────────────────────────
  const perceptions: FacturamaPerception[] = [];

  const addP = (p: FacturamaPerception | null) => { if (p) perceptions.push(p); };

  addP(mkPerception('001', '001', 'Sueldos, Salarios Rayas y Jornales',
    qd.salario.gravado, qd.salario.exento));

  addP(mkPerception('028', '028', 'Comisiones',
    qd.comisiones.gravado, qd.comisiones.exento));

  addP(mkPerception('010', '010', 'Premios por puntualidad',
    qd.bonoPuntualidad.gravado, qd.bonoPuntualidad.exento));

  // SAT: TipoPercepcion 038 no admite importe exento; todo va en gravado
  addP(mkPerception('038', '038', 'Otros ingresos por salarios',
    qd.otrosIngresos.gravado + qd.otrosIngresos.exento, 0));

  addP(mkPerception('029', '029', 'Vales de despensa',
    qd.valesDespensa.gravado, qd.valesDespensa.exento));

  addP(mkPerception('020', '020', 'Prima dominical',
    qd.primaDominical.gravado, qd.primaDominical.exento));

  addP(mkPerception('055', '055', 'Días de descanso obligatorios laborados',
    qd.diasDescanso.gravado, qd.diasDescanso.exento));

  // Horas extras: incluye detalle ExtraHours requerido por SAT
  const heTotal = round2(qd.horasExtras.gravado + qd.horasExtras.exento);
  if (heTotal > 0) {
    const sh = qd.sh > 0 ? qd.sh : info.sh;
    const horasExactas = sh > 0 ? qd.rawHe / (2 * sh) : 0;
    const horasRound   = Math.round(horasExactas * 100) / 100;
    const dias         = Math.max(1, Math.ceil(horasRound / 2));
    const horas        = Math.max(1, Math.round(horasRound));
    perceptions.push({
      PerceptionType: '019', Code: '019', Description: 'Horas extra',
      TaxedAmount: round2(qd.horasExtras.gravado),
      ExemptAmount: round2(qd.horasExtras.exento),
      ExtraHours: [{ Days: dias, HoursType: '01', ExtraHours: horas, PaidAmount: heTotal }],
    });
  }

  addP(mkPerception('021', '021', 'Prima vacacional',
    qd.primaVacacional.gravado, qd.primaVacacional.exento));

  addP(mkPerception('002', '002', 'Gratificación Anual (Aguinaldo)',
    qd.aguinaldo.gravado, qd.aguinaldo.exento));

  // ── Deductions ────────────────────────────────────────────────────────────
  const deductions: FacturamaDeduction[] = [];
  const addD = (d: FacturamaDeduction | null) => { if (d) deductions.push(d); };

  addD(mkDeduction('002', '002', 'ISR', qd.isr));
  addD(mkDeduction('001', '001', 'Seguridad social', qd.imss));
  addD(mkDeduction('010', '010', 'Retención crédito Infonavit', qd.infonavit));

  // ── Other payments ────────────────────────────────────────────────────────
  const otherPayments: FacturamaOtherPayment[] = [];

  {
    let amt = qd.subsidio > 0 ? round2(qd.subsidio) : 0.01;

    // Fix Facturama/SAT: Descuento decimals must ≤ Importe decimals.
    // Importe = percepciones + otrosPagos. If the sum ends in .0 or .X while
    // deducciones have .XX, SAT rejects it. Nudge subsidio by +0.01 if needed.
    const percTotal = perceptions.reduce((s, p) => s + p.TaxedAmount + p.ExemptAmount, 0);
    const dedTotal  = deductions.reduce((s, d) => s + d.Amount, 0);
    const importe   = round2(percTotal + amt);
    const descuento = round2(dedTotal);
    const decPlaces = (n: number) => { const s = n.toFixed(10).replace(/0+$/, ''); return s.includes('.') ? s.split('.')[1]!.length : 0; };
    if (decPlaces(descuento) > decPlaces(importe)) {
      amt = round2(amt + 0.01);
    }

    otherPayments.push({
      OtherPaymentType: '002', Code: '002',
      Description: 'Subsidio para el empleo',
      Amount: amt,
      EmploymentSubsidy: { Amount: amt },
    });
  }

  // ── Días del periodo ──────────────────────────────────────────────────────
  // Q1: 1-15 = 15 días. Q2: 16-último = días reales del periodo.
  const [endD] = q.fin.split('/').map(Number);
  // Q1 (qi par): último del mes anterior → día 14 = 15 días siempre
  // Q2 (qi impar): día 15 → penúltimo = endD - 14 días
  const daysPaid = qi % 2 === 0 ? 15 : (endD! - 14);

  // ── Ensamblar ─────────────────────────────────────────────────────────────
  const imssNorm = normalizeImss(empCfg.socialSecurityNumber ?? info.imss);

  return {
    NameId:         company.nameId,
    ExpeditionPlace: company.expeditionPlace,
    CfdiType:       'N',
    PaymentMethod:  'PUE',
    Serie:          CFDI_DEFAULTS.SERIE,
    Folio:          buildFolio(info.codigo, qi),
    Receiver: {
      Rfc:          (empCfg.rfc ?? info.rfc).toUpperCase().trim(),
      Name:         normalizeName(info.nombre),
      CfdiUse:      'CN01',
      FiscalRegime: empCfg.fiscalRegime,
      TaxZipCode:   empCfg.taxZipCode,
    },
    Complemento: {
      Payroll: {
        Type:               'O',
        PaymentDate:        toIsoDate(q.fin),
        InitialPaymentDate: toIsoDate(q.inicio),
        FinalPaymentDate:   toIsoDate(q.fin),
        DaysPaid:           daysPaid,
        Issuer: { EmployerRegistration: company.employerRegistration },
        Employee: {
          Curp:                    info.curp,
          ...(imssNorm ? { SocialSecurityNumber: imssNorm } : {}),
          EmployeeNumber:          info.codigo,
          Position:                info.puesto || 'Empleado',
          StartDateLaborRelations: empCfg.startDateLaborRelations,
          ContractType:            empCfg.contractType,
          RegimeType:              CFDI_DEFAULTS.REGIME_TYPE,
          Unionized:               empCfg.unionized,
          TypeOfJourney:           empCfg.typeOfJourney,
          FrequencyPayment:        CFDI_DEFAULTS.FREQ_PAYMENT,
          BaseSalary:              round2(info.sbc),
          DailySalary:             round2(info.sbc),
          PositionRisk:            empCfg.positionRisk,
          FederalEntityKey:        CFDI_DEFAULTS.FEDERAL_ENTITY,
        },
        Perceptions: { Details: perceptions },
        ...(deductions.length > 0 ? { Deductions: { Details: deductions } } : {}),
        OtherPayments: otherPayments,
      },
    },
  };
}
