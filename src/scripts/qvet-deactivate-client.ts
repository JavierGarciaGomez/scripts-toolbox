/**
 * QVET Deactivate Client - Puppeteer
 *
 * Desactiva un cliente desmarcando el checkbox "Activo"
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Load .env
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
} catch (err) {
  console.log('No se pudo cargar .env');
}

const QVET_USER = process.env.QVET_USER || '';
const QVET_PASS = process.env.QVET_PASS || '';
const QVET_AUTO = process.env.QVET_AUTO || '';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Carpeta para screenshots de debug
const SCREENSHOT_DIR = path.join(process.cwd(), 'tmp', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function screenshot(page: Page, name: string) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`   [Screenshot: ${name}.png]`);
}

async function login(page: Page): Promise<boolean> {
  console.log('Iniciando login...');

  try {
    await page.goto('https://go.qvet.net/', { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);

    console.log('   Llenando formulario...');
    await page.waitForSelector('#Clinica', { timeout: 15000 });
    await page.type('#Clinica', QVET_AUTO, { delay: 80 });
    await delay(300);
    await page.type('#UserName', QVET_USER, { delay: 80 });
    await delay(300);
    await page.type('#Password', QVET_PASS, { delay: 80 });
    await delay(500);

    console.log('   Haciendo clic en login...');
    await page.click('#btnLogin');
    await delay(5000);

    const currentUrl = page.url();
    console.log(`   URL actual: ${currentUrl}`);

    if (currentUrl.includes('AutoLogin')) {
      console.log('   Seleccionando sucursal...');
      await delay(2000);
      try {
        await page.waitForSelector('#IdCentro', { timeout: 15000 });
        await delay(1000);

        const dropdownClicked = await page.evaluate(() => {
          const wrapper = document.querySelector('.k-dropdown-wrap') ||
                         document.querySelector('[aria-owns="IdCentro_listbox"]') ||
                         document.querySelector('#IdCentro');
          if (wrapper) {
            (wrapper as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (dropdownClicked) {
          await delay(1000);
          await page.evaluate(() => {
            const items = document.querySelectorAll('#IdCentro_listbox li');
            if (items.length > 0) {
              (items[0] as HTMLElement).click();
            }
          });
          await delay(1500);
        }

        await page.click('#btnLogin');
        await delay(5000);
      } catch (e: any) {
        console.log(`   Error en AutoLogin: ${e.message}`);
      }
    }

    const loggedIn = await Promise.race([
      page.waitForSelector('.main-menu', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('.navbar', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('#navbarContent', { timeout: 20000 }).then(() => true).catch(() => false),
    ]);

    if (loggedIn) {
      console.log('   Login exitoso\n');
      return true;
    }

    const finalUrl = page.url();
    if (finalUrl.includes('/Home') || finalUrl.includes('Index')) {
      console.log('   Login exitoso (por URL)\n');
      return true;
    }

    console.log(`   Login fallo - URL final: ${finalUrl}`);
    return false;
  } catch (e: any) {
    console.log(`   Error en login: ${e.message}`);
    return false;
  }
}

async function navigateToClients(page: Page): Promise<boolean> {
  console.log('Navegando a Clientes / Mascotas...');

  try {
    // Click en menu Clientes / Mascotas
    const clicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a, .menu-item, .nav-link');
      for (const link of links) {
        const text = link.textContent || '';
        if (text.includes('Clientes') && text.includes('Mascotas')) {
          (link as HTMLElement).click();
          return true;
        }
      }
      // Fallback: buscar solo "Clientes"
      for (const link of links) {
        const text = link.textContent || '';
        if (text.includes('Clientes')) {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      await delay(3000);
      console.log('   Navegacion exitosa\n');
      return true;
    }

    console.log('   No se encontro el menu');
    return false;
  } catch (e: any) {
    console.log(`   Error navegando: ${e.message}`);
    return false;
  }
}

async function deactivateClient(page: Page, clientCode: string): Promise<{ success: boolean; message?: string }> {
  console.log(`\nDesactivando cliente ${clientCode}...`);

  try {
    // Buscar el campo de codigo y buscar el cliente
    console.log('   Buscando cliente...');

    // El campo de codigo tiene name="Id" y el ID termina en "_Id"
    const searchFound = await page.evaluate((code) => {
      // Buscar por name="Id" primero
      let input = document.querySelector('input[name="Id"].k-textbox') as HTMLInputElement;

      // Si no, buscar por ID que termina en _Id
      if (!input) {
        input = document.querySelector('input[id$="_Id"].k-textbox') as HTMLInputElement;
      }

      if (input) {
        input.focus();
        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, clientCode);

    if (searchFound) {
      await page.keyboard.press('Enter');
      await delay(3000);
    } else {
      return { success: false, message: 'Campo de codigo no encontrado' };
    }

    // Verificar que se encontro el cliente en el grid
    await screenshot(page, '00-despues-buscar');
    const rowExists = await page.$('.k-grid-content tr');
    if (!rowExists) {
      return { success: false, message: 'Cliente no encontrado en grid' };
    }

    // Seleccionar cliente y click en Modificar
    console.log('   Seleccionando cliente...');

    const rowCoords = await page.evaluate(() => {
      const row = document.querySelector('.k-grid-content tr.k-master-row');
      if (row) {
        const rect = row.getBoundingClientRect();
        return { x: rect.x + 100, y: rect.y + rect.height / 2 };
      }
      return null;
    });

    if (rowCoords) {
      await page.mouse.click(rowCoords.x, rowCoords.y);
      await delay(1000);
    }

    console.log('   Click en Modificar...');
    const modifyClicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a, span, button');
      for (const link of links) {
        if (link.textContent?.trim() === 'Modificar') {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!modifyClicked) {
      return { success: false, message: 'Boton Modificar no encontrado' };
    }

    await delay(3000);
    await screenshot(page, '01-ficha-abierta');

    // Buscar checkbox "Activo" y desmarcarlo
    console.log('   Buscando checkbox Activo...');

    const checkboxResult = await page.evaluate(() => {
      const $ = (window as any).jQuery;

      // Buscar checkbox por label o por nombre
      const labels = document.querySelectorAll('label');
      for (const label of labels) {
        if (label.textContent?.toLowerCase().includes('activo')) {
          // Buscar el checkbox asociado
          const forId = label.getAttribute('for');
          if (forId) {
            const checkbox = document.getElementById(forId) as HTMLInputElement;
            if (checkbox && checkbox.type === 'checkbox') {
              const wasChecked = checkbox.checked;
              if (wasChecked) {
                checkbox.click();
                return { found: true, wasChecked, clicked: true };
              }
              return { found: true, wasChecked, clicked: false, message: 'Ya estaba desactivado' };
            }
          }
          // Buscar checkbox cercano
          const nearbyCheckbox = label.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
          if (nearbyCheckbox) {
            const wasChecked = nearbyCheckbox.checked;
            if (wasChecked) {
              nearbyCheckbox.click();
              return { found: true, wasChecked, clicked: true };
            }
            return { found: true, wasChecked, clicked: false, message: 'Ya estaba desactivado' };
          }
        }
      }

      // Buscar por name o id que contenga "activo"
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const name = (cb.getAttribute('name') || '').toLowerCase();
        const id = (cb.getAttribute('id') || '').toLowerCase();
        if (name.includes('activo') || id.includes('activo')) {
          const checkbox = cb as HTMLInputElement;
          const wasChecked = checkbox.checked;
          if (wasChecked) {
            checkbox.click();
            return { found: true, wasChecked, clicked: true };
          }
          return { found: true, wasChecked, clicked: false, message: 'Ya estaba desactivado' };
        }
      }

      return { found: false };
    });

    console.log(`   Resultado checkbox: ${JSON.stringify(checkboxResult)}`);
    await screenshot(page, '02-checkbox-desmarcado');

    if (!checkboxResult.found) {
      await page.keyboard.press('Escape');
      await delay(500);
      return { success: false, message: 'Checkbox Activo no encontrado' };
    }

    if (!checkboxResult.clicked) {
      await page.keyboard.press('Escape');
      await delay(500);
      return { success: true, message: checkboxResult.message || 'Ya estaba desactivado' };
    }

    // Guardar cambios (el popup aparece despues de guardar)
    console.log('   Guardando cambios...');

    // Buscar boton guardar y obtener coordenadas para click real
    const saveCoords = await page.evaluate(() => {
      // Buscar directamente en todo el documento
      const selectors = [
        'button.guardar.k-button',
        'button.guardar',
        '[id$="_guardar"]',
      ];

      for (const sel of selectors) {
        const btn = document.querySelector(sel) as HTMLElement;
        if (btn) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              selector: sel,
              text: btn.textContent
            };
          }
        }
      }
      return null;
    });

    if (saveCoords) {
      console.log(`   Click en guardar: (${Math.round(saveCoords.x)}, ${Math.round(saveCoords.y)}) [${saveCoords.selector}]`);
      await page.mouse.click(saveCoords.x, saveCoords.y);
    } else {
      console.log('   Boton guardar no encontrado');
    }

    await delay(2000);
    await screenshot(page, '03-despues-guardar');

    // Esperar popup de confirmacion y aceptar
    console.log('   Esperando popup de confirmacion...');

    const confirmResult = await page.evaluate(() => {
      const $ = (window as any).jQuery;
      if ($) {
        // Buscar dialog de Kendo visible
        const dialog = $('.k-dialog, .k-confirm, .k-window').filter(':visible').last();
        if (dialog.length > 0) {
          const primaryBtn = dialog.find('button.k-primary, .k-button-solid-primary');
          if (primaryBtn.length > 0) {
            primaryBtn.first().click();
            return { found: true, clicked: true, method: 'kendo-primary' };
          }
          // Buscar boton que diga Si/Aceptar
          const buttons = dialog.find('button');
          for (let i = 0; i < buttons.length; i++) {
            const text = $(buttons[i]).text().toLowerCase();
            if (text.includes('si') || text.includes('sí') || text.includes('aceptar') || text.includes('ok')) {
              $(buttons[i]).click();
              return { found: true, clicked: true, method: 'kendo-text' };
            }
          }
        }
      }

      return { found: false, clicked: false };
    });

    console.log(`   Resultado confirmacion: ${JSON.stringify(confirmResult)}`);
    await delay(2000);

    // Cerrar ficha con boton Cerrar
    console.log('   Cerrando ficha...');
    const closeClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim() === 'Cerrar') {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!closeClicked) {
      await page.keyboard.press('Escape');
    }
    await delay(2000);

    return { success: true };

  } catch (e: any) {
    try {
      await page.keyboard.press('Escape');
      await delay(500);
    } catch {}
    return { success: false, message: e.message };
  }
}

async function main() {
  console.log('=================================');
  console.log('QVET - Desactivar Clientes');
  console.log('=================================\n');

  // Obtener codigos de clientes de los argumentos
  const clientCodes = process.argv.slice(2);

  if (clientCodes.length === 0) {
    console.log('Uso: npx ts-node src/scripts/qvet-deactivate-client.ts <codigo1> [codigo2] [codigo3] ...');
    console.log('Ejemplo: npx ts-node src/scripts/qvet-deactivate-client.ts 957864 960544');
    process.exit(1);
  }

  console.log(`Clientes a desactivar: ${clientCodes.join(', ')}`);
  console.log(`Total: ${clientCodes.length}`);
  console.log(`Usuario: ${QVET_USER}\n`);

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('Faltan credenciales en .env');
    process.exit(1);
  }

  let browser: Browser | null = null;
  const results: { code: string; success: boolean; message?: string | undefined }[] = [];

  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
      defaultViewport: null,
    });

    const page = await browser.newPage();

    // Login
    const loginOk = await login(page);
    if (!loginOk) {
      throw new Error('Login fallo');
    }

    // Navegar a Clientes
    const navOk = await navigateToClients(page);
    if (!navOk) {
      throw new Error('No se pudo navegar a Clientes');
    }

    // Procesar cada cliente
    for (let i = 0; i < clientCodes.length; i++) {
      const code = clientCodes[i]!;
      console.log(`\n[${i + 1}/${clientCodes.length}] Procesando cliente ${code}...`);

      const result = await deactivateClient(page, code);
      results.push({ code, success: result.success, message: result.message });

      if (result.success) {
        console.log(`   OK: Cliente ${code} desactivado`);
      } else {
        console.log(`   ERROR: ${result.message}`);
      }

      // Volver a Clientes para el siguiente
      if (i < clientCodes.length - 1) {
        await navigateToClients(page);
        await delay(1000);
      }
    }

    // Resumen
    console.log('\n=================================');
    console.log('RESUMEN');
    console.log('=================================');
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    console.log(`Exitosos: ${ok}`);
    console.log(`Fallidos: ${fail}`);

    if (fail > 0) {
      console.log('\nClientes con error:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.code}: ${r.message}`);
      });
    }

    // Mantener navegador abierto para verificar
    console.log('\nCerrando en 5 segundos...');
    await delay(5000);

  } catch (error: any) {
    console.error('\nError:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
