/**
 * QVET Deactivate Number-Name Clients
 *
 * Tries to deactivate clients with numeric/empty names.
 * Captures errors for review.
 *
 * Usage:
 *   npx ts-node src/scripts/qvet-deactivate-numbers.ts [--limit=N]
 */

import fs from 'fs';
import path from 'path';
import { Page } from 'puppeteer';
import { loadEnv, delay, launchBrowser, loginQVET } from './qvet/common';
import { navigateToClients, openClient, closeClient, saveClient } from './qvet/client-editor';

const CLIENTS_FILE = path.resolve('tmp/qvet-number-clients.json');
const LOG_FILE = path.resolve('tmp/qvet-numbers-log.txt');

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function logFile(msg: string) {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

interface NumberClient { id: number; name: string; }

async function processClient(page: Page, client: NumberClient): Promise<{ ok: boolean; error?: string; screenshot?: string }> {
  // Handle "no tiene mascota" popup - click No
  const mascotaPopup = await page.evaluate(() => {
    const windows = document.querySelectorAll('.k-window');
    for (const win of windows) {
      const content = (win.textContent || '').toLowerCase();
      if (content.includes('mascota') || content.includes('animal')) {
        const buttons = win.querySelectorAll('button, .k-button');
        for (const btn of buttons) {
          if ((btn.textContent || '').trim().toLowerCase() === 'no') {
            (btn as HTMLElement).click();
            return true;
          }
        }
      }
    }
    return false;
  });
  if (mascotaPopup) {
    logFile('      [POPUP] Mascota → No');
    await delay(500);
  }

  // Try to deactivate
  const checkboxResult = await page.evaluate(() => {
    const el = document.querySelector('.k-window-content [id$="_Actiu"]') as HTMLInputElement;
    if (!el) return false;
    if (el.checked) el.click();
    return true;
  });
  if (!checkboxResult) return { ok: false, error: 'Checkbox Activo no encontrado' };

  // Save
  await page.evaluate(() => {
    const modal = document.querySelector('.k-window-content') || document;
    const btn = modal.querySelector('button.guardar, [id$="_guardar"]') as HTMLElement;
    if (btn) btn.click();
  });
  await delay(1000);

  // Handle confirmation popup
  const popupHandled = await page.evaluate(() => {
    const windows = document.querySelectorAll('.k-window');
    for (const win of windows) {
      const title = (win.querySelector('.k-window-title')?.textContent || '').toLowerCase();
      if (title.includes('confirmar')) {
        const buttons = win.querySelectorAll('button, .k-button');
        for (const btn of buttons) {
          if ((btn.textContent || '').trim().toLowerCase() === 'si') {
            (btn as HTMLElement).click();
            return true;
          }
        }
      }
    }
    return false;
  });
  if (popupHandled) await delay(1000);

  // Capture all popups/errors for debugging
  const pageState = await page.evaluate(() => {
    const result: string[] = [];
    // All windows
    const windows = document.querySelectorAll('.k-window');
    windows.forEach((win, i) => {
      const title = (win.querySelector('.k-window-title')?.textContent || '').trim();
      const buttons: string[] = [];
      win.querySelectorAll('button, .k-button').forEach(b => {
        const t = (b.textContent || '').trim();
        if (t) buttons.push(t);
      });
      result.push(`WIN${i}: "${title}" btns=[${buttons.join(',')}]`);
    });
    // Validation errors
    const validations = document.querySelectorAll('.k-tooltip-validation, .field-validation-error');
    validations.forEach(v => {
      const t = (v.textContent || '').trim();
      if (t) result.push(`VALIDATION: ${t}`);
    });
    // Invalid fields
    const invalids = document.querySelectorAll('.k-invalid, .input-validation-error');
    invalids.forEach(el => {
      const input = el as HTMLInputElement;
      const rect = input.getBoundingClientRect();
      if (rect.width > 0) {
        const label = input.closest('.form-group, td, div')?.querySelector('label')?.textContent?.trim() || input.name || input.id;
        result.push(`INVALID: ${label}="${input.value}"`);
      }
    });
    // Check if error window
    for (const win of windows) {
      const title = (win.querySelector('.k-window-title')?.textContent || '').toLowerCase();
      if (title.includes('error') || title.includes('alert')) {
        const body = (win.querySelector('.k-window-content')?.textContent || '').trim().substring(0, 200);
        result.push(`ERROR_POPUP: ${body}`);
      }
    }
    return result;
  });

  // Take screenshot on error
  const ssPath = path.resolve(`tmp/qvet-numbers-${client.id}.png`);
  if (pageState.length > 0) {
    await page.screenshot({ path: ssPath, fullPage: false });
  }

  if (pageState.some(s => s.startsWith('ERROR_POPUP'))) {
    return { ok: false, error: pageState.join(' | '), screenshot: ssPath };
  }

  // Check if there are validation issues (but still consider it saved if no error popup)
  const hasValidation = pageState.some(s => s.startsWith('VALIDATION') || s.startsWith('INVALID'));
  if (hasValidation) {
    return { ok: false, error: pageState.join(' | '), screenshot: ssPath };
  }

  return { ok: true, screenshot: ssPath };
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!) : 0;

  const allClients: NumberClient[] = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8'));
  const toProcess = limit > 0 ? allClients.slice(0, limit) : allClients;

  logFile(`📋 QVET Deactivate Number-Name Clients`);
  logFile(`   Total: ${toProcess.length}`);

  const credentials = loadEnv();
  const browser = await launchBrowser();
  let page = await browser.newPage();
  const loginOk = await loginQVET(page, credentials, logFile);
  if (!loginOk) { await browser.close(); throw new Error('Login falló'); }

  const results: { id: number; name: string; ok: boolean; error?: string; screenshot?: string }[] = [];

  for (let i = 0; i < toProcess.length; i++) {
    const client = toProcess[i]!;
    const start = Date.now();
    logFile(`[${i + 1}/${toProcess.length}] ${client.id} (nombre: "${client.name}")`);

    try {
      let navOk = await navigateToClients(page, logFile);
      if (!navOk) {
        const pages = await browser.pages();
        for (const p of pages) { try { await p.close(); } catch {} }
        page = await browser.newPage();
        await loginQVET(page, credentials, logFile);
        navOk = await navigateToClients(page, logFile);
      }

      const opened = navOk ? await openClient(page, client.id, logFile) : false;
      if (!opened) {
        logFile(`   ❌ No se pudo abrir`);
        results.push({ ...client, ok: false, error: 'open_failed' });
        continue;
      }

      const r = await processClient(page, client);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (r.ok) {
        logFile(`   ✅ (${elapsed}s)`);
        await closeClient(page);
      } else {
        logFile(`   ❌ ${r.error} (${elapsed}s)`);
        logFile(`   📸 ${r.screenshot}`);
        await page.keyboard.press('Escape');
        await delay(500);
        await page.keyboard.press('Escape');
        await delay(500);
        try { await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 }); } catch {}
      }
      results.push({ ...client, ...r });
    } catch (e: any) {
      logFile(`   ❌ CRASH: ${e.message}`);
      results.push({ ...client, ok: false, error: e.message });
      try {
        const pages = await browser.pages();
        for (const p of pages) { try { await p.close(); } catch {} }
        page = await browser.newPage();
        await loginQVET(page, credentials, logFile);
      } catch {}
    }
  }

  // Summary
  const ok = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok);
  logFile(`\n========================================`);
  logFile(`✅ OK: ${ok} | ❌ Fail: ${fail.length}`);
  if (fail.length > 0) {
    logFile(`\nFallidos:`);
    fail.forEach(r => logFile(`  ${r.id} "${r.name}" → ${r.error}`));
  }
  logFile(`========================================`);

  // Save results JSON
  fs.writeFileSync('tmp/qvet-numbers-results.json', JSON.stringify(results, null, 2));

  await delay(2000);
  await browser.close();

  // Cleanup
  try {
    const { execSync } = require('child_process');
    execSync('kill -9 $(ps aux | grep chrome | grep -i "remote-debugging\\|no-first-run" | grep -v grep | awk \'{print $2}\') 2>/dev/null');
  } catch {}
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
