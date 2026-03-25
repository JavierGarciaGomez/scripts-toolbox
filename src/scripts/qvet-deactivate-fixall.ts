/**
 * QVET Fix All + Deactivate
 * Fixes bad phones, SMS, emails and deactivates in one pass.
 */
import fs from 'fs';
import path from 'path';
import { Page } from 'puppeteer';
import { loadEnv, delay, launchBrowser, loginQVET } from './qvet/common';
import { navigateToClients, openClient, closeClient } from './qvet/client-editor';

const ITEMS_FILE = path.resolve('tmp/qvet-fix-all.json');
const PROGRESS_FILE = path.resolve('tmp/.qvet-fixall-progress.json');
const LOG_FILE = path.resolve('tmp/qvet-fixall-log.txt');

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function logFile(msg: string) {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

interface Progress { done: number[]; failed: number[]; ok: number; fail: number; }
function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  return { done: [], failed: [], ok: 0, fail: 0 };
}
function saveProgressFile(p: Progress) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p)); }

function cleanupChrome() {
  try {
    const { execSync } = require('child_process');
    const pids = execSync('ps aux | grep chrome | grep -i "remote-debugging\\|no-first-run\\|disable-setuid" | grep -v grep | awk \'{print $2}\'', { encoding: 'utf-8' }).trim();
    if (pids) execSync(`kill -9 ${pids.split('\n').join(' ')} 2>/dev/null`);
  } catch {}
}
process.on('exit', cleanupChrome);
process.on('SIGINT', () => { cleanupChrome(); process.exit(1); });
process.on('SIGTERM', () => { cleanupChrome(); process.exit(1); });

async function clearField(page: Page, selector: string): Promise<void> {
  const el = await page.$(`.k-window-content ${selector}`);
  if (el) {
    await el.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.evaluate((sel) => {
      const e = document.querySelector(`.k-window-content ${sel}`) as HTMLInputElement;
      if (e) { e.value = ''; e.dispatchEvent(new Event('change', { bubbles: true })); }
    }, selector);
  }
}

async function typeInField(page: Page, selector: string, value: string): Promise<void> {
  const el = await page.$(`.k-window-content ${selector}`);
  if (el) {
    await el.click({ clickCount: 3 });
    await page.keyboard.type(value);
  }
}

async function processClient(page: Page, item: any): Promise<{ ok: boolean; error?: string }> {
  // 1. Clear SMS if needed
  if (item.clearSMS) {
    await clearField(page, '[id$="_TelefonoSMS"]');
    // Move digits to available field
    if (item.smsValue && item.moveSMSto) {
      const sel = item.moveSMSto === 'tel1' ? '[id$="_Telefon1"]' :
                  item.moveSMSto === 'tel2' ? '[id$="_Telefon2"]' : '[id$="_Fax"]';
      await typeInField(page, sel, item.smsValue);
    }
  }

  // 2. Fix TEL1 if needed
  if (item.clearTel1) {
    if (item.tel1Digits) {
      // Replace with just the digits
      await typeInField(page, '[id$="_Telefon1"]', item.tel1Digits);
    } else {
      await clearField(page, '[id$="_Telefon1"]');
    }
  }

  // 3. Fix TEL2 if needed
  if (item.clearTel2) {
    if (item.tel2Digits) {
      await typeInField(page, '[id$="_Telefon2"]', item.tel2Digits);
    } else {
      await clearField(page, '[id$="_Telefon2"]');
    }
  }

  // 4. Fix email if needed
  if (item.clearEmail) {
    await clearField(page, '[id$="_Email"]');
  }

  // 5. Deactivate
  const checked = await page.evaluate(() => {
    const el = document.querySelector('.k-window-content [id$="_Actiu"]') as HTMLInputElement;
    if (!el) return false;
    if (el.checked) el.click();
    return true;
  });
  if (!checked) return { ok: false, error: 'Checkbox no encontrado' };

  // 6. Save
  await page.evaluate(() => {
    const modal = document.querySelector('.k-window-content') || document;
    const btn = modal.querySelector('button.guardar, [id$="_guardar"]') as HTMLElement;
    if (btn) btn.click();
  });
  await delay(1000);

  // 7. Handle confirmation popup (debt)
  await page.evaluate(() => {
    const windows = document.querySelectorAll('.k-window');
    for (const win of windows) {
      const title = (win.querySelector('.k-window-title')?.textContent || '').toLowerCase();
      if (title.includes('confirmar')) {
        const buttons = win.querySelectorAll('button, .k-button');
        for (const btn of buttons) {
          if ((btn.textContent || '').trim().toLowerCase() === 'si') {
            (btn as HTMLElement).click();
            return;
          }
        }
      }
    }
  });
  await delay(500);

  // 8. Check error
  const error = await page.evaluate(() => {
    const windows = document.querySelectorAll('.k-window');
    for (const win of windows) {
      const title = (win.querySelector('.k-window-title')?.textContent || '').toLowerCase();
      if (title.includes('error') || title.includes('alert')) {
        return (win.querySelector('.k-window-content')?.textContent || '').trim().substring(0, 100);
      }
    }
    return null;
  });
  if (error) return { ok: false, error };

  return { ok: true };
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!) : 0;
  const reset = args.includes('--reset');

  const allItems: any[] = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf-8'));
  if (reset && fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  const progress = loadProgress();
  const doneSet = new Set(progress.done);
  const pending = allItems.filter((i: any) => !doneSet.has(i.id));

  logFile(`\n--- ${new Date().toISOString()} ---`);
  logFile(`🔧 Fix All + Deactivate`);
  logFile(`   Total: ${allItems.length} | Done: ${progress.done.length} | Pending: ${pending.length}`);

  const toProcess = limit > 0 ? pending.slice(0, limit) : pending;
  if (toProcess.length === 0) { logFile('   ✅ Nada pendiente'); return; }

  const credentials = loadEnv();
  const BATCH_SIZE = 50;
  const CLIENT_TIMEOUT = 30000;
  const times: number[] = [];

  for (let batchStart = 0; batchStart < toProcess.length; batchStart += BATCH_SIZE) {
    const batch = toProcess.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

    logFile(`\n📦 LOTE ${batchNum}/${totalBatches} (${batch.length} clientes)`);

    // Fresh browser per batch
    const browser = await launchBrowser();
    let page = await browser.newPage();
    const loginOk = await loginQVET(page, credentials, logFile);
    if (!loginOk) {
      logFile(`   ❌ Login falló, saltando lote`);
      await browser.close();
      cleanupChrome();
      continue;
    }

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i]!;
      const start = Date.now();
      const globalRemaining = toProcess.length - batchStart - i;
      const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      const eta = avg > 0 ? new Date(Date.now() + avg * globalRemaining).toLocaleTimeString() : '...';
      const fixes = [item.clearSMS?'SMS':'', item.clearTel1?'TEL1':'', item.clearTel2?'TEL2':'', item.clearEmail?'EMAIL':''].filter(Boolean).join('+') || 'CLEAN';
      logFile(`[${progress.done.length + 1}/${allItems.length}] ${item.id} (${fixes}) (quedan ${globalRemaining}, ETA: ${eta})`);

      try {
        const result = await Promise.race([
          (async () => {
            const navOk = await navigateToClients(page, logFile);
            if (!navOk) return { ok: false, error: 'nav_failed' };

            const opened = await openClient(page, item.id, logFile);
            if (!opened) return { ok: false, error: 'open_failed' };

            const r = await processClient(page, item);
            if (r.ok) {
              await closeClient(page);
            } else {
              await page.keyboard.press('Escape'); await delay(300);
              await page.keyboard.press('Escape'); await delay(300);
              try { await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 }); } catch {}
            }
            return r;
          })(),
          new Promise<{ ok: false; error: string }>(resolve =>
            setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), CLIENT_TIMEOUT)
          ),
        ]);

        const elapsedMs = Date.now() - start;
        times.push(elapsedMs);
        const elapsed = (elapsedMs / 1000).toFixed(1);

        if (result.ok) {
          progress.ok++;
          logFile(`   ✅ (${elapsed}s)`);
        } else {
          progress.fail++;
          progress.failed.push(item.id);
          logFile(`   ❌ ${result.error} (${elapsed}s)`);
        }
      } catch (e: any) {
        progress.fail++;
        progress.failed.push(item.id);
        logFile(`   ❌ CRASH: ${e.message}`);
        // Break batch on crash, next batch gets fresh browser
        progress.done.push(item.id);
        saveProgressFile(progress);
        break;
      }

      progress.done.push(item.id);
      saveProgressFile(progress);
    }

    // Close browser after each batch
    try { await browser.close(); } catch {}
    cleanupChrome();

    logFile(`--- Lote ${batchNum}: OK ${progress.ok} | Fail ${progress.fail} ---`);
  }

  logFile(`\n========================================`);
  logFile(`✅ OK: ${progress.ok} | ❌ Fail: ${progress.fail} | Total: ${progress.done.length}/${allItems.length}`);
  logFile(`========================================`);
}

main().catch(e => { console.error('Fatal:', e.message); cleanupChrome(); process.exit(1); });
