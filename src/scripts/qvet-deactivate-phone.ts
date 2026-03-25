/**
 * QVET Deactivate Phone Clients
 *
 * Dedicated script for deactivating clients with SMS phone > 9 digits.
 * Flow per client: clear Móvil → País SMS MÉX → Deactivate → Move phone → Save
 *
 * Usage:
 *   npx ts-node src/scripts/qvet-deactivate-phone.ts [--limit=N] [--reset]
 */

import fs from 'fs';
import path from 'path';
import { Page } from 'puppeteer';
import {
  loadEnv, delay, launchBrowser, loginQVET,
} from './qvet/common';
import {
  navigateToClients, openClient, closeClient,
} from './qvet/client-editor';

const CLIENTS_FILE = path.resolve('tmp/qvet-phone-clients.json');
const PROGRESS_FILE = path.resolve('tmp/.qvet-phone-progress.json');
const LOG_FILE = path.resolve('tmp/qvet-phone-log.txt');

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function logFile(msg: string) {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

interface PhoneClient {
  id: number;
  tel1: string | null;
  tel2: string | null;
  tel3: string | null;
}

interface Progress {
  done: number[];
  failed: number[];
  ok: number;
  fail: number;
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  return { done: [], failed: [], ok: 0, fail: 0 };
}

function saveProgress(p: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p));
}

async function processClient(page: Page, client: PhoneClient): Promise<{ ok: boolean; error?: string }> {
  // Step 1: Clear Número Móvil physically
  const smsField = await page.$('.k-window-content [id$="_TelefonoSMS"]');
  if (smsField) {
    await smsField.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    // Also clear via JS to be sure
    await page.evaluate(() => {
      const el = document.querySelector('.k-window-content [id$="_TelefonoSMS"]') as HTMLInputElement;
      if (el) { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  // Step 2: Deactivate
  const checkboxResult = await page.evaluate(() => {
    const el = document.querySelector('.k-window-content [id$="_Actiu"]') as HTMLInputElement;
    if (!el) return false;
    if (el.checked) el.click();
    return true;
  });
  if (!checkboxResult) return { ok: false, error: 'Checkbox Activo no encontrado' };

  // Step 4: Move phone to available field
  const telField = client.tel1 ? '_Telefon1' : client.tel2 ? '_Telefon2' : client.tel3 ? '_Fax' : null;
  const telValue = client.tel1 || client.tel2 || client.tel3;
  if (telField && telValue) {
    const telEl = await page.$(`.k-window-content [id$="${telField}"]`);
    if (telEl) {
      await telEl.click({ clickCount: 3 });
      await page.keyboard.type(telValue);
    }
  }

  // Step 5: Save
  await page.evaluate(() => {
    const modal = document.querySelector('.k-window-content') || document;
    const btn = modal.querySelector('button.guardar, [id$="_guardar"]') as HTMLElement;
    if (btn) btn.click();
  });
  await delay(1000);

  // Step 6: Handle confirmation popup (debt)
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
  if (popupHandled) {
    logFile('      [POPUP] Deuda confirmada');
    await delay(1000);
  }

  // Check for error popup
  const hasError = await page.evaluate(() => {
    const windows = document.querySelectorAll('.k-window');
    for (const win of windows) {
      const title = (win.querySelector('.k-window-title')?.textContent || '').toLowerCase();
      if (title.includes('error') || title.includes('alert')) {
        return (win.querySelector('.k-window-content')?.textContent || '').trim().substring(0, 100);
      }
    }
    return null;
  });
  if (hasError) return { ok: false, error: hasError };

  return { ok: true };
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!) : 0;
  const reset = args.includes('--reset');

  if (!fs.existsSync(CLIENTS_FILE)) {
    console.log('No se encontró', CLIENTS_FILE);
    process.exit(1);
  }

  const allClients: PhoneClient[] = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8'));
  if (reset && fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  const progress = loadProgress();
  const doneSet = new Set(progress.done);
  const pending = allClients.filter(c => !doneSet.has(c.id));

  logFile(`📱 QVET Deactivate Phone Clients`);
  logFile(`   Total: ${allClients.length} | Done: ${progress.done.length} | Pending: ${pending.length}`);
  if (limit > 0) logFile(`   Límite: ${limit}`);

  const toProcess = limit > 0 ? pending.slice(0, limit) : pending;
  if (toProcess.length === 0) { logFile('   ✅ Nada pendiente'); return; }

  const credentials = loadEnv();
  const browser = await launchBrowser();
  let page = await browser.newPage();

  const loginOk = await loginQVET(page, credentials, logFile);
  if (!loginOk) { await browser.close(); throw new Error('Login falló'); }

  const CLIENT_TIMEOUT = 45000;
  const times: number[] = [];

  for (let i = 0; i < toProcess.length; i++) {
    const client = toProcess[i]!;
    const start = Date.now();
    const idx = progress.done.length + 1;
    const remaining = toProcess.length - i;
    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const eta = avg > 0 ? new Date(Date.now() + avg * remaining).toLocaleTimeString() : '...';
    logFile(`[${idx}/${allClients.length}] ${client.id} (quedan ${remaining}, ETA: ${eta})`);

    try {
      const result = await Promise.race([
        (async () => {
          let navOk = await navigateToClients(page, logFile);
          if (!navOk) {
            // Recover
            const pages = await browser.pages();
            for (const p of pages) { try { await p.close(); } catch {} }
            page = await browser.newPage();
            await loginQVET(page, credentials, logFile);
            navOk = await navigateToClients(page, logFile);
          }
          if (!navOk) return { ok: false, error: 'nav_failed' };

          const opened = await openClient(page, client.id, logFile);
          if (!opened) return { ok: false, error: 'open_failed' };

          const r = await processClient(page, client);
          if (r.ok) {
            await closeClient(page);
          } else {
            // Force close
            await page.keyboard.press('Escape');
            await delay(500);
            await page.keyboard.press('Escape');
            await delay(500);
            try { await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 }); } catch {}
          }
          return r;
        })(),
        new Promise<{ ok: false; error: string }>(resolve =>
          setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), CLIENT_TIMEOUT)
        ),
      ]);

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      const elapsedMs = Date.now() - start;
      times.push(elapsedMs);

      if (result.ok) {
        progress.ok++;
        logFile(`   ✅ (${elapsed}s)`);
      } else {
        progress.fail++;
        progress.failed.push(client.id);
        logFile(`   ❌ ${result.error} (${elapsed}s)`);

        if (result.error === 'TIMEOUT') {
          // Full recovery
          const pages = await browser.pages();
          for (const p of pages) { try { await p.close(); } catch {} }
          page = await browser.newPage();
          await loginQVET(page, credentials, logFile);
        }
      }
    } catch (e: any) {
      progress.fail++;
      progress.failed.push(client.id);
      logFile(`   ❌ CRASH: ${e.message}`);
      // Full recovery
      try {
        const pages = await browser.pages();
        for (const p of pages) { try { await p.close(); } catch {} }
        page = await browser.newPage();
        await loginQVET(page, credentials, logFile);
      } catch {}
    }

    progress.done.push(client.id);
    saveProgress(progress);
  }

  logFile(`\n========================================`);
  logFile(`✅ OK: ${progress.ok} | ❌ Fail: ${progress.fail} | Total: ${progress.done.length}/${allClients.length}`);
  logFile(`========================================`);

  await delay(3000);
  await browser.close();
  cleanupChrome();
}

function cleanupChrome() {
  try {
    const { execSync } = require('child_process');
    const pids = execSync('ps aux | grep chrome | grep -i "remote-debugging\\|no-first-run\\|disable-setuid" | grep -v grep | awk \'{print $2}\'', { encoding: 'utf-8' }).trim();
    if (pids) {
      execSync(`kill -9 ${pids.split('\n').join(' ')} 2>/dev/null`);
      logFile(`🧹 Limpieza: ${pids.split('\n').length} procesos Chrome huérfanos eliminados`);
    }
  } catch { /* no orphans */ }
}

// Cleanup on any exit
process.on('exit', cleanupChrome);
process.on('SIGINT', () => { cleanupChrome(); process.exit(1); });
process.on('SIGTERM', () => { cleanupChrome(); process.exit(1); });
process.on('uncaughtException', (e) => { logFile(`❌ Uncaught: ${e.message}`); cleanupChrome(); process.exit(1); });

main().catch(e => { console.error('Fatal:', e.message); cleanupChrome(); process.exit(1); });
