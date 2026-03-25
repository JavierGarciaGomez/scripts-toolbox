/**
 * QVET Client Editor
 *
 * Functions to navigate to Clients, open, edit, save and close clients in QVET.
 * Reuses field editors from article-editor.ts.
 */

import { Page } from 'puppeteer';
import { delay, log } from './common';
import { Logger } from './types';

// =============================================================================
// Navigation
// =============================================================================

export async function navigateToClients(page: Page, logger: Logger = log): Promise<boolean> {
  try {
    // Check if we're already on the clients page (grid with tipoobjeto="Cliente")
    const alreadyThere = await page.evaluate(() => {
      return !!document.querySelector('[tipoobjeto="Cliente"]');
    });
    if (alreadyThere) return true;

    // Step 1: Click "Inicio" to expand the sidebar menu
    await page.evaluate(() => {
      const allLinks = document.querySelectorAll('a, li');
      for (const link of allLinks) {
        const directText = Array.from(link.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => (n.textContent || '').trim())
          .join('');
        if (directText === 'Inicio') {
          (link as HTMLElement).click();
          return;
        }
      }
    });
    await delay(500);

    // Step 2: Click "Clientes / Mascotas" - find <a> by textContent
    // (the spans inside are 0x0, but their parent <a> is clickable even if also 0x0)
    const clicked = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = (link.textContent || '').trim();
        if (text === 'Clientes / Mascotas') {
          link.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      logger('   [ERROR] No se encontró "Clientes / Mascotas" en el menú');
      return false;
    }
    await delay(1000);

    // Verify: the client grid should now exist
    const hasGrid = await page.evaluate(() => {
      return !!document.querySelector('[tipoobjeto="Cliente"]');
    });
    if (!hasGrid) {
      await delay(1000);
    }

    // Step 3: Select "Todos" in Activos filter
    await page.evaluate(() => {
      const radios = document.querySelectorAll('input[type="radio"][name="Activo_Basica"]');
      for (const radio of radios) {
        if ((radio as HTMLInputElement).value === 'on') {
          (radio as HTMLInputElement).click();
          return;
        }
      }
      if (radios.length >= 3) {
        (radios[2] as HTMLInputElement).click();
      }
    });
    await delay(500);

    return true;
  } catch (e: any) {
    logger(`   [ERROR] navigateToClients: ${e.message}`);
    return false;
  }
}

export async function openClient(page: Page, idPropietario: number, logger: Logger = log): Promise<boolean> {
  try {
    // Type the ID in the "Código" field
    const idField = await page.$('input[name="Id"]');
    if (!idField) {
      logger(`      [ERROR] Campo "Código" (input[name="Id"]) no encontrado`);
      return false;
    }

    await idField.click({ clickCount: 3 });
    await page.keyboard.type(String(idPropietario));
    await page.keyboard.press('Enter');
    await delay(1000);

    // Get the grid prefix and find the row
    const prefix = await page.evaluate(() => {
      const idInput = document.querySelector('input[name="Id"]') as HTMLInputElement;
      return idInput ? idInput.id.replace('_Id', '') : '';
    });

    const rowCoords = await page.evaluate((pfx) => {
      const $ = (window as any).jQuery;
      if (!$) return null;
      const gridEl = $(`#${pfx}_Grid`);
      if (gridEl.length === 0) return null;
      const row = gridEl.find('.k-grid-content tr').first();
      if (row.length === 0) return null;
      const rect = row[0].getBoundingClientRect();
      if (rect.width === 0) return null;
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, prefix);

    if (!rowCoords) {
      logger(`      [ERROR] No se encontró fila en el grid para cliente ${idPropietario}`);
      return false;
    }

    await page.mouse.click(rowCoords.x, rowCoords.y, { clickCount: 2 });
    await delay(1000);

    // Wait for the modal to open
    const modal = await page.$('.k-window-content');
    if (!modal) {
      logger(`      [ERROR] Modal no se abrió para cliente ${idPropietario}`);
      return false;
    }

    return true;
  } catch (e: any) {
    logger(`      [ERROR] No se pudo abrir cliente ${idPropietario}: ${e.message}`);
    return false;
  }
}

// =============================================================================
// Tab Selection (reuse the same Kendo TabStrip pattern)
// =============================================================================

export { selectTab } from './article-editor';

// =============================================================================
// Field Editors (reuse from article-editor.ts)
// =============================================================================

export {
  editTextField,
  editCheckbox,
  editTextarea,
  editDropdown,
  editDropdownWithClick,
  inspectSelector,
} from './article-editor';

// =============================================================================
// CP Popup Handler
// =============================================================================

/**
 * After editing the CP field, QVET opens a "Seleccionar población" popup.
 * This function detects it and selects the first row.
 */
export async function handlePoblacionPopup(page: Page, logger: Logger = log): Promise<boolean> {
  try {
    // Wait a moment for the popup to appear
    await delay(1500);

    // Check if a popup/window with a grid appeared (besides the main client modal)
    const popupFound = await page.evaluate(() => {
      const windows = document.querySelectorAll('.k-window');
      // Look for a secondary window (not the main client modal)
      for (const win of windows) {
        const title = win.querySelector('.k-window-title, .k-window-titlebar');
        const titleText = (title?.textContent || '').toLowerCase();
        const grid = win.querySelector('.k-grid');
        if (grid && (titleText.includes('poblaci') || titleText.includes('seleccionar') || titleText.includes('población'))) {
          return true;
        }
      }
      // Also check for any new popup grid that appeared
      const allWindows = document.querySelectorAll('.k-window');
      return allWindows.length > 1;
    });

    if (!popupFound) {
      return false; // No popup, nothing to do
    }

    logger('         [INFO] Popup de población detectado, seleccionando primera opción...');

    // Click the first row in the popup grid
    const clicked = await page.evaluate(() => {
      const windows = document.querySelectorAll('.k-window');
      // Find the topmost/last window (the popup, not the main modal)
      for (let i = windows.length - 1; i >= 0; i--) {
        const win = windows[i]!;
        const grid = win.querySelector('.k-grid');
        if (grid) {
          const row = grid.querySelector('.k-grid-content tr, tbody tr');
          if (row) {
            const rect = row.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              // Click the row to select it
              row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
              return { success: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
          }
        }
      }
      return { success: false };
    });

    if (clicked.success && 'x' in clicked && clicked.x !== undefined && clicked.y !== undefined) {
      // Also do a physical double-click as backup
      await page.mouse.click(clicked.x, clicked.y, { clickCount: 2 });
      await delay(1500);
    }

    // Check if popup closed; if not, try clicking an "Aceptar" or "Seleccionar" button
    const stillOpen = await page.evaluate(() => {
      return document.querySelectorAll('.k-window').length > 1;
    });

    if (stillOpen) {
      await page.evaluate(() => {
        const windows = document.querySelectorAll('.k-window');
        for (let i = windows.length - 1; i >= 0; i--) {
          const win = windows[i]!;
          const buttons = win.querySelectorAll('button, .k-button');
          for (const btn of buttons) {
            const text = (btn.textContent || '').toLowerCase();
            if (text.includes('aceptar') || text.includes('seleccionar') || text.includes('ok')) {
              (btn as HTMLElement).click();
              return;
            }
          }
        }
      });
      await delay(1000);
    }

    logger('         [INFO] Popup de población cerrado');
    return true;
  } catch (e: any) {
    logger(`         [WARN] Error manejando popup de población: ${e.message}`);
    return false;
  }
}

// =============================================================================
// Save & Close
// =============================================================================

export async function saveClient(page: Page): Promise<boolean> {
  try {
    const saved = await page.evaluate(() => {
      const modal = document.querySelector('.k-window-content') || document;

      // Try guardar button
      const guardarBtn = modal.querySelector('button.guardar, [id$="_guardar"]');
      if (guardarBtn) {
        (guardarBtn as HTMLElement).click();
        return true;
      }

      // Fallback: any button with "guardar" text
      const buttons = modal.querySelectorAll('button, .btn, .k-button');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('guardar')) {
          (btn as HTMLElement).click();
          return true;
        }
      }

      return false;
    });

    await delay(3000);

    if (!saved) return false;

    // Debug: check ALL popups/windows that appeared after save
    const popupDebug = await page.evaluate(() => {
      const info: { title: string; content: string; buttons: string[]; html: string }[] = [];
      const windows = document.querySelectorAll('.k-window');
      for (const win of windows) {
        const title = (win.querySelector('.k-window-title, .k-window-titlebar')?.textContent || '').trim();
        const content = (win.querySelector('.k-window-content')?.textContent || '').trim();
        const buttons: string[] = [];
        win.querySelectorAll('button, .k-button, a.k-button').forEach(btn => {
          const text = (btn.textContent || '').trim();
          if (text) buttons.push(text);
        });
        const html = win.innerHTML.substring(0, 500);
        info.push({ title, content: content.substring(0, 200), buttons, html });
      }
      // Also check for kendo confirm/alert dialogs
      const dialogs = document.querySelectorAll('.k-dialog, .k-alert, .k-confirm');
      for (const d of dialogs) {
        const content = (d.textContent || '').trim();
        const buttons: string[] = [];
        d.querySelectorAll('button, .k-button').forEach(btn => {
          buttons.push((btn.textContent || '').trim());
        });
        info.push({ title: 'dialog', content: content.substring(0, 200), buttons, html: '' });
      }
      return info;
    });

    if (popupDebug.length > 0) {
      console.log(`   [DEBUG-POPUP] ${popupDebug.length} ventanas detectadas:`);
      for (const p of popupDebug) {
        console.log(`     title="${p.title}" content="${p.content}" buttons=[${p.buttons.join(', ')}]`);
      }
    }

    // Handle confirmation popups (e.g. "tiene deuda, ¿estás seguro?")
    const confirmHandled = await page.evaluate(() => {
      // Check all windows for confirmation dialogs
      const allElements = document.querySelectorAll('.k-window, .k-dialog, .k-confirm, .k-alert');
      for (const el of allElements) {
        const content = (el.textContent || '').toLowerCase();
        if (content.includes('deuda') || content.includes('seguro') || content.includes('confirmar') || content.includes('desactivar')) {
          const buttons = el.querySelectorAll('button, .k-button, a.k-button, input[type="button"]');
          for (const btn of buttons) {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (text === 'sí' || text === 'si' || text === 'aceptar' || text === 'ok' || text === 'yes' || text === 'confirmar') {
              (btn as HTMLElement).click();
              return text;
            }
          }
        }
      }
      return null;
    });

    if (confirmHandled) {
      console.log(`   [POPUP] Confirmación aceptada: "${confirmHandled}"`);
      await delay(3000);
    }

    // Check if save succeeded: if modal closed or no longer has unsaved changes, it's OK
    // Only flag as error if an explicit error popup appeared (not pre-existing validation tooltips)
    const saveResult = await page.evaluate(() => {
      // Check for error popup windows (not the client modal itself)
      const windows = document.querySelectorAll('.k-window');
      for (const win of windows) {
        const title = (win.querySelector('.k-window-title')?.textContent || '').toLowerCase();
        if (title.includes('error') || title.includes('alert')) {
          const body = (win.querySelector('.k-window-content')?.textContent || '').trim();
          return { ok: false, error: body };
        }
      }
      return { ok: true };
    });

    if (!saveResult.ok) {
      console.log(`   ⚠️ Error post-guardado: ${saveResult.error}`);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function closeClient(page: Page): Promise<void> {
  try {
    const closed = await page.evaluate(() => {
      const closeBtn = document.querySelector('.k-window-action .k-i-close, .k-window-action .k-i-x, .k-window-titlebar-actions button');
      if (closeBtn) {
        const btn = closeBtn.closest('button, a, span') || closeBtn;
        (btn as HTMLElement).click();
        return true;
      }
      return false;
    });

    if (!closed) {
      await page.keyboard.press('Escape');
    }
    await delay(1500);

    // If modal still open, press Escape again
    const modalStillOpen = await page.$('.k-window-content');
    if (modalStillOpen) {
      await page.keyboard.press('Escape');
      await delay(1000);
    }
  } catch {
    // Ignore
  }
}
