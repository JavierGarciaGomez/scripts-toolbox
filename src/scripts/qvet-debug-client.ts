/**
 * Debug: open a client and capture all popups/state
 */
import fs from 'fs';
import path from 'path';
import { loadEnv, delay, launchBrowser, loginQVET, log } from './qvet/common';
import { navigateToClients, openClient } from './qvet/client-editor';

async function main() {
  const id = parseInt(process.argv[2] || '883446');
  const credentials = loadEnv();
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await loginQVET(page, credentials, log);
  await navigateToClients(page, log);
  const opened = await openClient(page, id, log);
  if (!opened) { console.log('No se pudo abrir'); await browser.close(); return; }

  console.log('Cliente abierto. Desactivando y guardando...');

  // Deactivate
  await page.evaluate(() => {
    const el = document.querySelector('.k-window-content [id$="_Actiu"]') as HTMLInputElement;
    if (el && el.checked) el.click();
  });
  await delay(500);

  // Save
  await page.evaluate(() => {
    const modal = document.querySelector('.k-window-content') || document;
    const btn = modal.querySelector('button.guardar, [id$="_guardar"]') as HTMLElement;
    if (btn) btn.click();
  });
  console.log('Guardar clickeado. Esperando popup...');
  await delay(3000);

  // Capture ALL windows
  const state = await page.evaluate(() => {
    const result: any[] = [];
    document.querySelectorAll('.k-window').forEach((win, i) => {
      const title = (win.querySelector('.k-window-title')?.textContent || '').trim();
      const content = (win.querySelector('.k-window-content')?.textContent || '').trim().substring(0, 300);
      const buttons: string[] = [];
      win.querySelectorAll('button, .k-button, a').forEach(b => {
        const t = (b.textContent || '').trim();
        if (t && t.length < 30) buttons.push(t);
      });
      result.push({ i, title, content, buttons });
    });
    return result;
  });

  console.log('\nVentanas:');
  state.forEach(w => {
    console.log(`\n  [${w.i}] title="${w.title}"`);
    console.log(`  buttons: [${w.buttons.join(', ')}]`);
    console.log(`  content: ${w.content.substring(0, 200)}`);
  });

  await page.screenshot({ path: `tmp/debug-${id}.png` });
  console.log(`\nScreenshot: tmp/debug-${id}.png`);

  console.log('\nEsperando 30s para que revises...');
  await delay(30000);
  await browser.close();
}

main().catch(console.error);
