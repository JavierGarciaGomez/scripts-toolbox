/**
 * Fix bad emails and deactivate clients
 */
import fs from 'fs';
import path from 'path';
import { loadEnv, delay, launchBrowser, loginQVET } from './qvet/common';
import { navigateToClients, openClient, closeClient } from './qvet/client-editor';

const EMAILS_FILE = path.resolve('tmp/qvet-bad-emails.json');
const LOG_FILE = path.resolve('tmp/qvet-fix-emails-log.txt');

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function logFile(msg: string) {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

function cleanupChrome() {
  try {
    const { execSync } = require('child_process');
    const pids = execSync('ps aux | grep chrome | grep -i "remote-debugging\\|no-first-run" | grep -v grep | awk \'{print $2}\'', { encoding: 'utf-8' }).trim();
    if (pids) execSync(`kill -9 ${pids.split('\n').join(' ')} 2>/dev/null`);
  } catch {}
}
process.on('exit', cleanupChrome);
process.on('SIGINT', () => { cleanupChrome(); process.exit(1); });
process.on('SIGTERM', () => { cleanupChrome(); process.exit(1); });

async function main() {
  const items: { id: number; email: string; fix: string }[] = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf-8'));
  logFile(`\n--- ${new Date().toISOString()} ---`);
  logFile(`📧 Fix Emails + Deactivate: ${items.length} clientes`);

  const credentials = loadEnv();
  const browser = await launchBrowser();
  let page = await browser.newPage();
  const loginOk = await loginQVET(page, credentials, logFile);
  if (!loginOk) { await browser.close(); throw new Error('Login falló'); }

  let ok = 0, fail = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const start = Date.now();
    logFile(`[${i + 1}/${items.length}] ${item.id} | "${item.email}" → "${item.fix}"`);

    try {
      let navOk = await navigateToClients(page, logFile);
      if (!navOk) {
        const pages = await browser.pages();
        for (const p of pages) { try { await p.close(); } catch {} }
        page = await browser.newPage();
        await loginQVET(page, credentials, logFile);
        navOk = await navigateToClients(page, logFile);
      }

      const opened = navOk ? await openClient(page, item.id, logFile) : false;
      if (!opened) { logFile(`   ❌ open_failed`); fail++; continue; }

      // Fix email
      const emailField = await page.$('.k-window-content [id$="_Email"]');
      if (emailField) {
        await emailField.click({ clickCount: 3 });
        const newEmail = item.fix === '__CLEAR__' ? '' : item.fix;
        if (newEmail === '') {
          await page.keyboard.press('Backspace');
        } else {
          await page.keyboard.type(newEmail);
        }
      }

      // Deactivate
      await page.evaluate(() => {
        const el = document.querySelector('.k-window-content [id$="_Actiu"]') as HTMLInputElement;
        if (el && el.checked) el.click();
      });

      // Save
      await page.evaluate(() => {
        const modal = document.querySelector('.k-window-content') || document;
        const btn = modal.querySelector('button.guardar, [id$="_guardar"]') as HTMLElement;
        if (btn) btn.click();
      });
      await delay(1000);

      // Handle confirmation popup
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

      await closeClient(page);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      logFile(`   ✅ (${elapsed}s)`);
      ok++;
    } catch (e: any) {
      logFile(`   ❌ ${e.message}`);
      fail++;
      try {
        const pages = await browser.pages();
        for (const p of pages) { try { await p.close(); } catch {} }
        page = await browser.newPage();
        await loginQVET(page, credentials, logFile);
      } catch {}
    }
  }

  logFile(`\n✅ OK: ${ok} | ❌ Fail: ${fail}`);
  await delay(2000);
  await browser.close();
}

main().catch(e => { console.error('Fatal:', e.message); cleanupChrome(); process.exit(1); });
