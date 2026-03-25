/**
 * Fix problem clients (bad email, SMS 8 digits, CP without población) and deactivate
 */
import fs from 'fs';
import path from 'path';
import { Page } from 'puppeteer';
import { loadEnv, delay, launchBrowser, loginQVET } from './qvet/common';
import { navigateToClients, openClient, closeClient } from './qvet/client-editor';

const LOG_FILE = path.resolve('tmp/qvet-fix-problems-log.txt');
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
    const pids = execSync('ps aux | grep chrome | grep -i "remote-debugging\\|no-first-run\\|disable-setuid" | grep -v grep | awk \'{print $2}\'', { encoding: 'utf-8' }).trim();
    if (pids) execSync(`kill -9 ${pids.split('\n').join(' ')} 2>/dev/null`);
  } catch {}
}
process.on('exit', cleanupChrome);
process.on('SIGINT', () => { cleanupChrome(); process.exit(1); });
process.on('SIGTERM', () => { cleanupChrome(); process.exit(1); });

interface Fix {
  id: number;
  sms8: string | null;
  badEmail: string | null;
  cpNoPob: string | null;
  tel1: string;
  tel2: string;
  emailFix: string;
}

async function processClient(page: Page, fix: Fix): Promise<{ ok: boolean; error?: string }> {
  // 1. Fix SMS 8 digits: clear SMS, move to available tel
  if (fix.sms8) {
    const smsField = await page.$('.k-window-content [id$="_TelefonoSMS"]');
    if (smsField) {
      await smsField.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.evaluate(() => {
        const el = document.querySelector('.k-window-content [id$="_TelefonoSMS"]') as HTMLInputElement;
        if (el) { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
      });
    }
    // Move to available field
    const telField = !fix.tel1 ? '_Telefon1' : !fix.tel2 ? '_Telefon2' : '_Fax';
    const telEl = await page.$(`.k-window-content [id$="${telField}"]`);
    if (telEl) {
      await telEl.click({ clickCount: 3 });
      await page.keyboard.type(fix.sms8);
    }
  }

  // 2. Fix bad email
  if (fix.badEmail) {
    const emailField = await page.$('.k-window-content [id$="_Email"]');
    if (emailField) {
      await emailField.click({ clickCount: 3 });
      if (fix.emailFix === '__CLEAR__') {
        await page.keyboard.press('Backspace');
      } else {
        await page.keyboard.type(fix.emailFix);
      }
    }
  }

  // 3. Fix CP without población: clear CP
  if (fix.cpNoPob) {
    const cpField = await page.$('.k-window-content [id$="_CP"]');
    if (cpField) {
      await cpField.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await delay(300);
      // Dismiss población popup if it appears
      await page.evaluate(() => {
        const windows = document.querySelectorAll('.k-window');
        if (windows.length > 1) {
          const popup = windows[windows.length - 1]!;
          const closeBtn = popup.querySelector('.k-window-action .k-i-close, .k-dialog-close');
          if (closeBtn) (closeBtn as HTMLElement).click();
        }
      });
      await delay(300);
    }
  }

  // 4. Deactivate
  await page.evaluate(() => {
    const el = document.querySelector('.k-window-content [id$="_Actiu"]') as HTMLInputElement;
    if (el && el.checked) el.click();
  });

  // 5. Save
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

  // Check error popup
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
  const problems = JSON.parse(fs.readFileSync('tmp/qvet-problem-clients.json', 'utf-8'));

  // Build fixes
  const fixes: Fix[] = problems.map((p: any) => {
    let emailFix = '';
    if (p.badEmail) {
      const e = p.badEmail;
      if (['SD', 'NO TIENE', 'sd'].includes(e) || e === '123@HOTMAIL,COM') emailFix = '__CLEAR__';
      else if (e.includes('%')) emailFix = e.replace('%', '@');
      else if (e.match(/@.*@/)) emailFix = '__CLEAR__';
      else emailFix = '__CLEAR__';
    }
    return { ...p, emailFix };
  });

  logFile(`\n--- ${new Date().toISOString()} ---`);
  logFile(`🔧 Fix Problems + Deactivate: ${fixes.length} clientes`);

  const credentials = loadEnv();
  const browser = await launchBrowser();
  let page = await browser.newPage();
  await loginQVET(page, credentials, logFile);

  let ok = 0, fail = 0;

  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i]!;
    const start = Date.now();
    const desc = [fix.sms8 ? 'SMS8' : '', fix.badEmail ? 'EMAIL' : '', fix.cpNoPob ? 'CP' : ''].filter(Boolean).join('+');
    logFile(`[${i + 1}/${fixes.length}] ${fix.id} (${desc})`);

    try {
      let navOk = await navigateToClients(page, logFile);
      if (!navOk) {
        const pages = await browser.pages();
        for (const p of pages) { try { await p.close(); } catch {} }
        page = await browser.newPage();
        await loginQVET(page, credentials, logFile);
        navOk = await navigateToClients(page, logFile);
      }

      const opened = navOk ? await openClient(page, fix.id, logFile) : false;
      if (!opened) { logFile(`   ❌ open_failed`); fail++; continue; }

      const r = await processClient(page, fix);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (r.ok) {
        await closeClient(page);
        logFile(`   ✅ (${elapsed}s)`);
        ok++;
      } else {
        logFile(`   ❌ ${r.error} (${elapsed}s)`);
        fail++;
        await page.keyboard.press('Escape'); await delay(500);
        await page.keyboard.press('Escape'); await delay(500);
        try { await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 }); } catch {}
      }
    } catch (e: any) {
      logFile(`   ❌ CRASH: ${e.message}`);
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
