/**
 * Configuración para la generación de CFDIs de nómina 2021.
 *
 * Carga desde tmp/nominas-2021-cfdi-config.json.
 * Genera una plantilla con --init-config en stamp.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

export const CONFIG_PATH = path.resolve('tmp/nominas-2021-cfdi-config.json');

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface FacturamaCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface EmployeeConfig {
  /** Fecha de inicio de relación laboral. YYYY-MM-DD. REQUERIDO. */
  startDateLaborRelations: string;
  /** RFC del empleado (13 caracteres). Override del valor del Excel. */
  rfc?: string;
  /** Número de Seguridad Social IMSS (11 dígitos). Override del valor del Excel. */
  socialSecurityNumber?: string;
  /** Régimen fiscal del empleado. Default: "605" (Sin obligaciones fiscales). */
  fiscalRegime?: string;
  /** CP fiscal del empleado. Default: expeditionPlace de la empresa. */
  taxZipCode?: string;
  /** Tipo de contrato SAT. Default: "01" (Tiempo indeterminado). */
  contractType?: string;
  /** Tipo de jornada SAT. Default: "01" (Diurna). */
  typeOfJourney?: string;
  /** Sindicalizado. Default: false. */
  unionized?: boolean;
  /** Riesgo de puesto SAT. Default: "1" (Clase I). */
  positionRisk?: string;
}

export interface CompanyConfig {
  /** NameId en Facturama (perfil de la empresa). */
  nameId: number;
  /** CP del lugar de expedición. */
  expeditionPlace: string;
  /** Registro patronal IMSS. */
  employerRegistration: string;
}

export interface CfdiConfig {
  /** Configuración de empresa por ambiente (sandbox y production pueden diferir). */
  company: {
    sandbox: CompanyConfig;
    production: CompanyConfig;
  };
  facturama: {
    sandbox: FacturamaCredentials;
    production: FacturamaCredentials;
  };
  /** Configuración por código de empleado (ej: "AAA", "ADG"). */
  employees: Record<string, EmployeeConfig>;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const CFDI_DEFAULTS = {
  REGIME_TYPE:       '02',    // Sueldos y salarios
  FISCAL_REGIME:     '605',   // Sin obligaciones fiscales
  CONTRACT_TYPE:     '01',    // Tiempo indeterminado
  TYPE_OF_JOURNEY:   '01',    // Diurna
  POSITION_RISK:     '1',     // Clase I
  FEDERAL_ENTITY:    'YUC',   // Yucatán
  FREQ_PAYMENT:      '04',    // Quincenal
  SERIE:             'NOM',
} as const;

// ─── Loader ───────────────────────────────────────────────────────────────────

export function loadConfig(): CfdiConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config no encontrado: ${CONFIG_PATH}\n` +
      `Ejecuta: npx ts-node src/scripts/nominas-cfdi-facturama/stamp.ts --init-config`
    );
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as CfdiConfig;
  validateConfig(raw);
  return raw;
}

function validateConfig(cfg: CfdiConfig): void {
  const errors: string[] = [];

  for (const env of ['sandbox', 'production'] as const) {
    const co = cfg.company?.[env];
    if (!co?.nameId)               errors.push(`company.${env}.nameId faltante`);
    if (!co?.expeditionPlace)       errors.push(`company.${env}.expeditionPlace faltante`);
    if (!co?.employerRegistration || co.employerRegistration === 'COMPLETAR')
      errors.push(`company.${env}.employerRegistration no configurado`);
  }
  if (!cfg.facturama?.sandbox?.apiKey)     errors.push('facturama.sandbox.apiKey faltante');
  if (!cfg.employees || Object.keys(cfg.employees).length === 0)
    errors.push('employees vacío');

  for (const [code, emp] of Object.entries(cfg.employees ?? {})) {
    if (!emp.startDateLaborRelations || emp.startDateLaborRelations === 'COMPLETAR')
      errors.push(`employees.${code}.startDateLaborRelations no configurado`);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(emp.startDateLaborRelations))
      errors.push(`employees.${code}.startDateLaborRelations debe ser YYYY-MM-DD`);
  }

  if (errors.length > 0) {
    throw new Error(`Config inválido:\n  - ${errors.join('\n  - ')}`);
  }
}

// ─── Per-employee getter ───────────────────────────────────────────────────────

export function getEmployeeConfig(
  cfg: CfdiConfig,
  code: string,
  env: 'sandbox' | 'production',
): {
  startDateLaborRelations: string;
  fiscalRegime: string;
  taxZipCode: string;
  contractType: string;
  typeOfJourney: string;
  unionized: boolean;
  positionRisk: string;
  rfc?: string;
  socialSecurityNumber?: string;
} {
  const emp = cfg.employees[code];
  if (!emp) throw new Error(`Empleado ${code} no encontrado en config`);
  return {
    startDateLaborRelations: emp.startDateLaborRelations,
    fiscalRegime:  emp.fiscalRegime  ?? CFDI_DEFAULTS.FISCAL_REGIME,
    taxZipCode:    emp.taxZipCode    ?? cfg.company[env].expeditionPlace,
    contractType:  emp.contractType  ?? CFDI_DEFAULTS.CONTRACT_TYPE,
    typeOfJourney: emp.typeOfJourney ?? CFDI_DEFAULTS.TYPE_OF_JOURNEY,
    unionized:    emp.unionized    ?? false,
    positionRisk: emp.positionRisk ?? CFDI_DEFAULTS.POSITION_RISK,
    ...(emp.rfc !== undefined ? { rfc: emp.rfc } : {}),
    ...(emp.socialSecurityNumber !== undefined ? { socialSecurityNumber: emp.socialSecurityNumber } : {}),
  };
}
