#!/usr/bin/env ts-node
/**
 * stamp.ts — CLI para timbrar CFDIs de nómina 2021 con Facturama.
 *
 * Uso:
 *   npx ts-node src/scripts/nominas-cfdi-facturama/stamp.ts [opciones]
 *
 * Opciones:
 *   --env=sandbox|production   Ambiente (default: sandbox)
 *   --employee=CODE            Solo procesar este empleado (ej: AAA)
 *   --quincena=LABEL           Solo procesar esta quincena (ej: "Ene Q1")
 *   --qi=N                     Solo procesar el índice de quincena 0-23
 *   --limit=N                  Máximo de CFDIs a timbrar (para pruebas)
 *   --dry-run                  Generar JSON pero no timbrar
 *   --init-config              Generar plantilla de config en tmp/
 *   --base-dir=PATH            Carpeta raíz de nóminas 2021 (override)
 *   --out-dir=PATH             Carpeta de salida (default: tmp/cfdi-2021)
 *
 * Ejemplos:
 *   npx ts-node src/scripts/nominas-cfdi-facturama/stamp.ts --init-config
 *   npx ts-node src/scripts/nominas-cfdi-facturama/stamp.ts --dry-run --employee=AAA
 *   npx ts-node src/scripts/nominas-cfdi-facturama/stamp.ts --env=sandbox --limit=5
 *   npx ts-node src/scripts/nominas-cfdi-facturama/stamp.ts --env=production
 */

import * as fs   from 'fs';
import * as path from 'path';
import { leerTodo, QUINCENAS, applyRules } from '../nominas-cfdi-2021';
import { loadConfig, CONFIG_PATH, CfdiConfig, CFDI_DEFAULTS } from './config';
import { buildPayrollRequest }  from './builder';
import { FacturamaClient }      from './client';

// ─── Parse args ───────────────────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

// ─── Init config template ─────────────────────────────────────────────────────

function initConfig(): void {
  const template: CfdiConfig = {
    company: {
      sandbox: {
        nameId: 16,
        expeditionPlace: '78220',
        employerRegistration: 'COMPLETAR',
      },
      production: {
        nameId: 16,
        expeditionPlace: 'COMPLETAR',
        employerRegistration: 'COMPLETAR',
      },
    },
    facturama: {
      sandbox: {
        apiKey:    'hvetsandbox2',
        apiSecret: 'hvetsandbox2',
      },
      production: {
        apiKey:    'COMPLETAR',
        apiSecret: 'COMPLETAR',
      },
    },
    employees: {
      AAA: { startDateLaborRelations: 'COMPLETAR' },
    },
  };

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(template, null, 2), 'utf-8');
  console.log(`Plantilla generada en: ${CONFIG_PATH}`);
  console.log('Completa los campos marcados con "COMPLETAR" y vuelve a ejecutar.');
}

// ─── Sleep helper ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (hasFlag('init-config')) {
    initConfig();
    return;
  }

  // Load config
  const cfg     = loadConfig();
  const env     = (getArg('env') ?? 'sandbox') as 'sandbox' | 'production';
  const dryRun  = hasFlag('dry-run');
  const empFilter  = getArg('employee');
  const qLabel  = getArg('quincena');
  const qiStr   = getArg('qi');
  const limitStr = getArg('limit');
  const limit   = limitStr ? parseInt(limitStr, 10) : Infinity;
  const baseDir = getArg('base-dir');
  const outDir  = getArg('out-dir') ?? 'tmp/cfdi-2021';

  if (env !== 'sandbox' && env !== 'production') {
    console.error('Error: --env debe ser "sandbox" o "production"');
    process.exit(1);
  }

  const creds = env === 'sandbox' ? cfg.facturama.sandbox : cfg.facturama.production;
  const client = new FacturamaClient(creds, env === 'sandbox');

  console.log(`\n=== Timbrado CFDI Nómina 2021 ===`);
  console.log(`Ambiente: ${env.toUpperCase()}${dryRun ? ' (DRY RUN)' : ''}`);

  // Load payroll data
  console.log('\nCargando datos de nómina...');
  const cols = leerTodo(baseDir);
  applyRules(cols);
  console.log(`  ${cols.size} colaboradores cargados`);

  // Build work list: [employeeCode, qi]
  interface WorkItem {
    code: string;
    qi:   number;
  }
  const workList: WorkItem[] = [];

  for (const [code, data] of Array.from(cols)) {
    if (empFilter && code !== empFilter) continue;
    if (!cfg.employees[code]) {
      // Skip employees not in config (no startDateLaborRelations)
      continue;
    }

    for (let qi = 0; qi < QUINCENAS.length; qi++) {
      if (qiStr !== undefined && qi !== parseInt(qiStr, 10)) continue;
      if (qLabel && QUINCENAS[qi]!.label !== qLabel) continue;

      const qd = data.quincenas[qi];
      if (!qd) continue;
      if (qd.excluded) continue; // excluida: no timbrar // employee not in this quincena

      workList.push({ code, qi });
    }
  }

  if (workList.length === 0) {
    console.log('\nNo hay CFDIs a timbrar con los filtros especificados.');
    return;
  }

  // Load already-stamped folios (skip list)
  const skipFile = path.join(outDir, 'stamped-folios.json');
  const stampedFolios = new Set<string>();
  if (fs.existsSync(skipFile)) {
    const skipData = JSON.parse(fs.readFileSync(skipFile, 'utf-8')) as Record<string, string[]>;
    for (const folios of Object.values(skipData)) {
      for (const f of folios) stampedFolios.add(f);
    }
    console.log(`  Skip list: ${stampedFolios.size} folios ya timbrados`);
  }

  const total = Math.min(workList.length, limit);
  console.log(`\n${total} CFDIs a procesar${workList.length > limit ? ` (limitado a ${limit} de ${workList.length})` : ''}`);

  // Prepare output dir
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'json'), { recursive: true });

  // Real-time log (fixed name so you can tail -f it)
  const logFile = path.join(outDir, 'stamp.log');
  const log = fs.createWriteStream(logFile, { flags: 'w' });
  const logLine = (line: string) => { process.stdout.write(line); log.write(line); };

  // Results tracking
  interface Result {
    code:      string;
    quincena:  string;
    status:    'ok' | 'dry' | 'error' | 'skip';
    folio?:    string;
    uuid?:     string;
    facturamaId?: string;
    error?:    string;
  }
  const results: Result[] = [];

  let processed = 0;
  let ok = 0, errors = 0, skipped = 0;

  for (const { code, qi } of workList.slice(0, limit)) {
    const q      = QUINCENAS[qi]!;
    const data   = cols.get(code)!;
    const qd     = data.quincenas[qi]!;
    const info   = data.info;
    const label  = `${code} ${q.label}`;

    processed++;
    logLine(`[${processed}/${total}] ${label.padEnd(18)}`);

    // Build request
    let request;
    try {
      request = buildPayrollRequest({ info, qd, qi, cfg, env });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLine(` ERROR (build): ${msg}\n`);
      results.push({ code, quincena: q.label, status: 'error', error: `build: ${msg}` });
      errors++;
      continue;
    }

    // Skip already-stamped folios
    if (stampedFolios.has(request.Folio ?? '')) {
      logLine(` SKIP (ya timbrado)\n`);
      results.push({ code, quincena: q.label, status: 'skip', folio: request.Folio ?? '' });
      skipped++;
      continue;
    }

    // Save JSON always
    const jsonFile = path.join(outDir, 'json', `${code}-${q.folder}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(request, null, 2), 'utf-8');

    if (dryRun) {
      logLine(` DRY OK → ${jsonFile}\n`);
      results.push({ code, quincena: q.label, status: 'dry', folio: request.Folio ?? '' });
      ok++;
      continue;
    }

    // Stamp
    try {
      const cfdi = await client.stampPayroll(request);
      const uuid = cfdi.Complement?.TaxStamp?.Uuid ?? '';
      logLine(` OK  UUID: ${uuid}\n`);
      results.push({ code, quincena: q.label, status: 'ok', folio: cfdi.Folio, uuid, facturamaId: cfdi.Id });
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLine(` ERROR: ${msg}\n`);
      results.push({ code, quincena: q.label, status: 'error', error: msg });
      errors++;
    }
  }

  log.end();

  // ── Summary ──────────────────────────────────────────────────────────────────
  const reportFile = path.join(outDir, `reporte-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({ env, dryRun, results }, null, 2), 'utf-8');

  console.log('\n─────────────────────────────────────');
  console.log(`OK: ${ok}  Errores: ${errors}  Saltados: ${skipped}`);
  console.log(`Reporte: ${reportFile}`);
  console.log(`Log en tiempo real: tail -f ${logFile}`);
  console.log('JSON generados:', path.join(outDir, 'json'));
}

main().catch(err => {
  console.error('\nError fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
