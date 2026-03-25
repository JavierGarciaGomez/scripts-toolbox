/**
 * QVET Common Utilities
 *
 * Shared functions: env loading, delay, screenshots, logging, QVET login.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { Logger } from './types';

// =============================================================================
// Environment
// =============================================================================

export function loadEnv(): { user: string; pass: string; auto: string } {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match && match[1] && match[2]) {
          process.env[match[1].trim()] = match[2].trim();
        }
      });
    }
  } catch {
    console.log('Warning: could not load .env');
  }

  return {
    user: process.env.QVET_USER || '',
    pass: process.env.QVET_PASS || '',
    auto: process.env.QVET_AUTO || '',
  };
}

// =============================================================================
// Utilities
// =============================================================================

export const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// =============================================================================
// Screenshots
// =============================================================================

let screenshotDir = '';

export function setScreenshotDir(dir: string): void {
  screenshotDir = dir;
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function screenshot(page: Page, name: string): Promise<void> {
  if (!screenshotDir) return;
  try {
    const filePath = path.join(screenshotDir, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
  } catch {
    // Don't fail on screenshots
  }
}

// =============================================================================
// Logger
// =============================================================================

let logStream: fs.WriteStream | null = null;

export function initLogger(logPath: string): Logger {
  logStream = fs.createWriteStream(logPath, { flags: 'a' });
  return log;
}

export function closeLogger(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

export function log(msg: string): void {
  console.log(msg);
  if (logStream) {
    const clean = msg
      .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[✅❌⏭️📝📑📊📄📋👤🏢🔐🏥⚠️💾⏳🔍ℹ️📍]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trimStart();
    logStream.write(clean + '\n');
  }
}

// =============================================================================
// Browser
// =============================================================================

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
    defaultViewport: null,
  });
}

// =============================================================================
// QVET Login
// =============================================================================

// Captured base URL after login (dynamic server)
let qvetBaseUrl = '';

export function getBaseUrl(): string {
  return qvetBaseUrl;
}

export async function loginQVET(
  page: Page,
  credentials: { user: string; pass: string; auto: string },
  logger: Logger = log,
): Promise<boolean> {
  logger('🔐 Iniciando login...');

  try {
    await page.goto('https://go.qvet.net/', { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);

    await page.waitForSelector('#Clinica', { timeout: 15000 });
    // Clear fields before typing (in case of re-login with pre-filled values)
    await page.evaluate(() => {
      (document.querySelector('#Clinica') as HTMLInputElement).value = '';
      (document.querySelector('#UserName') as HTMLInputElement).value = '';
      (document.querySelector('#Password') as HTMLInputElement).value = '';
    });
    await page.type('#Clinica', credentials.auto, { delay: 80 });
    await delay(300);
    await page.type('#UserName', credentials.user, { delay: 80 });
    await delay(300);
    await page.type('#Password', credentials.pass, { delay: 80 });
    await delay(500);

    await page.click('#btnLogin');
    await delay(5000);

    const currentUrl = page.url();

    if (currentUrl.includes('AutoLogin')) {
      await delay(2000);
      try {
        await page.waitForSelector('#IdCentro', { timeout: 15000 });
        await delay(1000);

        await page.evaluate(() => {
          const wrapper = document.querySelector('.k-dropdown-wrap') ||
                         document.querySelector('[aria-owns="IdCentro_listbox"]');
          if (wrapper) (wrapper as HTMLElement).click();
        });

        await delay(1000);
        // Select URBAN CENTER specifically
        await page.evaluate(() => {
          const items = document.querySelectorAll('#IdCentro_listbox li');
          let selected = false;
          for (const item of items) {
            const text = (item.textContent || '').toUpperCase();
            if (text.includes('URBAN')) {
              (item as HTMLElement).click();
              selected = true;
              break;
            }
          }
          if (!selected && items.length > 0) {
            (items[0] as HTMLElement).click();
          }
        });
        await delay(1500);

        await page.click('#btnLogin');
        await delay(5000);
      } catch (e: any) {
        logger(`   Error en AutoLogin: ${e.message}`);
      }
    }

    const finalUrl = page.url();
    if (finalUrl.includes('/Home') || finalUrl.includes('Index')) {
      const urlObj = new URL(finalUrl);
      qvetBaseUrl = urlObj.origin;
      logger(`   ✅ Login exitoso (servidor: ${qvetBaseUrl})\n`);
      return true;
    }

    return false;
  } catch (e: any) {
    logger(`   ❌ Error en login: ${e.message}`);
    return false;
  }
}

// =============================================================================
// Data directory
// =============================================================================

export function ensureDataDir(): string {
  const dataDir = path.join(process.cwd(), 'data', 'qvet');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}
