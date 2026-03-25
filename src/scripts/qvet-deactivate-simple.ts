/**
 * QVET Deactivate Simple Clients (no phone issue, just ACTIVO=0)
 *
 * Usage:
 *   npx ts-node src/scripts/qvet-deactivate-simple.ts [--limit=N] [--reset]
 */

import fs from 'fs';
import path from 'path';
import { loadEnv, delay, launchBrowser, loginQVET } from './qvet/common';
import { navigateToClients, openClient, closeClient } from './qvet/client-editor';

const CLIENTS_FILE = path.resolve('tmp/qvet-simple-clients.json');
const PROGRESS_FILE = path.resolve('tmp/.qvet-simple-progress.json');
const LOG_FILE = path.resolve('tmp/qvet-simple-log.txt');

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
function saveProgress(p: Progress) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p)); }

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

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!) : 0;
  const reset = args.includes('--reset');

  const allClients: { id: number }[] = JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8'));
  if (reset && fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  const progress = loadProgress();
  const doneSet = new Set(progress.done);
  const pending = allClients.filter(c => !doneSet.has(c.id));

  logFile(`\n--- ${new Date().toISOString()} ---`);
  logFile(`📋 QVET Deactivate Simple Clients`);
  logFile(`   Total: ${allClients.length} | Done: ${progress.done.length} | Pending: ${pending.length}`);

  const toProcess = limit > 0 ? pending.slice(0, limit) : pending;
  if (toProcess.length === 0) { logFile('   ✅ Nada pendiente'); return; }

  const credentials = loadEnv();
  const browser = await launchBrowser();
  let page = await browser.newPage();
  const loginOk = await loginQVET(page, credentials, logFile);
  if (!loginOk) { await browser.close(); throw new Error('Login falló'); }

  const times: number[] = [];
  const CLIENT_TIMEOUT = 30000;

  for (let i = 0; i < toProcess.length; i++) {
    const client = toProcess[i]!;
    const start = Date.now();
    const remaining = toProcess.length - i;
    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const eta = avg > 0 ? new Date(Date.now() + avg * remaining).toLocaleTimeString() : '...';
    logFile(`[${progress.done.length + 1}/${allClients.length}] ${client.id} (quedan ${remaining}, ETA: ${eta})`);

    try {
      const result = await Promise.race([
        (async () => {
          let navOk = await navigateToClients(page, logFile);
          if (!navOk) {
            const pages = await browser.pages();
            for (const p of pages) { try { await p.close(); } catch {} }
            page = await browser.newPage();
            await loginQVET(page, credentials, logFile);
            navOk = await navigateToClients(page, logFile);
          }
          if (!navOk) return 'nav_failed';

          const opened = await openClient(page, client.id, logFile);
          if (!opened) return 'open_failed';

          // Deactivate
          const ok = await page.evaluate(() => {
            const el = document.querySelector('.k-window-content [id$="_Actiu"]') as HTMLInputElement;
            if (!el) return false;
            if (el.checked) el.click();
            return true;
          });
          if (!ok) return 'checkbox_not_found';

          // Save
          await page.evaluate(() => {
            const modal = document.querySelector('.k-window-content') || document;
            const btn = modal.querySelector('button.guardar, [id$="_guardar"]') as HTMLElement;
            if (btn) btn.click();
          });
          await delay(1000);

          // Handle confirmation popup (debt)
          const popup = await page.evaluate(() => {
            const windows = document.querySelectorAll('.k-window');
            for (const win of windows) {
              const title = (win.querySelector('.k-window-title')?.textContent || '').toLowerCase();
              if (title.includes('confirmar')) {
                const buttons = win.querySelectorAll('button, .k-button');
                for (const btn of buttons) {
                  if ((btn.textContent || '').trim().toLowerCase() === 'si') {
                    (btn as HTMLElement).click();
                    return 'debt';
                  }
                }
              }
            }
            return null;
          });
          if (popup) await delay(1000);

          await closeClient(page);
          return 'ok';
        })(),
        new Promise<string>(resolve => setTimeout(() => resolve('timeout'), CLIENT_TIMEOUT)),
      ]);

      const elapsedMs = Date.now() - start;
      times.push(elapsedMs);
      const elapsed = (elapsedMs / 1000).toFixed(1);

      if (result === 'ok') {
        progress.ok++;
        logFile(`   ✅ (${elapsed}s)`);
      } else {
        progress.fail++;
        progress.failed.push(client.id);
        logFile(`   ❌ ${result} (${elapsed}s)`);
        if (result === 'timeout') {
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

  await delay(2000);
  await browser.close();
}

main().catch(e => { console.error('Fatal:', e.message); cleanupChrome(); process.exit(1); });
