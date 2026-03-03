/**
 * QVET Article Editor
 *
 * Functions to open, navigate, edit, save and close articles in QVET.
 * All editing happens via Puppeteer on the QVET web UI (Kendo UI controls).
 */

import { Page } from 'puppeteer';
import { delay, log } from './common';
import { GRID_COLUMN_INDEX } from './column-map';
import { Logger } from './types';

// =============================================================================
// Navigation
// =============================================================================

export async function navigateToArticles(page: Page): Promise<boolean> {
  try {
    const alreadyThere = await page.$('input[name*="IdArticulo"]');
    if (!alreadyThere) {
      const clicked = await page.evaluate(() => {
        const links = document.querySelectorAll('a, .menu-item, .nav-link');
        for (const link of links) {
          const text = link.textContent || '';
          if (text.includes('Artículos') || text.includes('Conceptos')) {
            (link as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) return false;
      await page.waitForSelector('input[name*="IdArticulo"]', { timeout: 15000 }).catch(() => {});
      await delay(1000);
    }

    // Select "Todos" radio to include inactive articles
    await page.evaluate(() => {
      const radios = document.querySelectorAll('input[type="radio"][name="Activo"]');
      for (const radio of radios) {
        const parent = radio.closest('div, label, span');
        if (parent && parent.textContent?.includes('Todos')) {
          (radio as HTMLInputElement).click();
          return;
        }
      }
    });
    await delay(500);

    return true;
  } catch {
    return false;
  }
}

export async function openArticle(page: Page, idArticulo: number, logger: Logger = log): Promise<boolean> {
  try {
    await page.waitForSelector('input[name*="IdArticulo"]', { timeout: 10000 });

    const searchField = await page.$('input[name*="IdArticulo"]') as any;
    if (!searchField) {
      logger(`      [ERROR] Campo de búsqueda no encontrado`);
      return false;
    }

    await searchField.click({ clickCount: 3 });
    await page.keyboard.type(String(idArticulo));
    await page.keyboard.press('Enter');
    await delay(2000);

    const row = await page.$('.k-grid-content tr');
    if (!row) {
      logger(`      [ERROR] No se encontró fila en el grid para artículo ${idArticulo}`);
      return false;
    }

    await row.click({ clickCount: 2 });
    await delay(3000);

    await page.waitForSelector('.k-window-content, .FichaArticulo', { timeout: 10000 });
    return true;
  } catch (e: any) {
    logger(`      [ERROR] No se pudo abrir artículo ${idArticulo}: ${e.message}`);
    return false;
  }
}

export async function selectTab(page: Page, tabName: string): Promise<boolean> {
  return await page.evaluate((name) => {
    const $ = (window as any).jQuery;
    if (!$) return false;

    const tabStrips = $('[data-role="tabstrip"]');
    for (let i = 0; i < tabStrips.length; i++) {
      const tabStrip = $(tabStrips[i]).data('kendoTabStrip');
      if (!tabStrip) continue;

      const items = tabStrip.tabGroup.children('li');
      for (let j = 0; j < items.length; j++) {
        const text = $(items[j]).text().trim();
        if (text.toLowerCase().includes(name.toLowerCase())) {
          tabStrip.select(j);
          return true;
        }
      }
    }
    return false;
  }, tabName);
}

// =============================================================================
// Debug: inspect what a selector resolves to
// =============================================================================

interface ElementInfo {
  tagName: string;
  id: string;
  name: string;
  type: string;
  value: string;
  visible: boolean;
  label: string;
  inModal: boolean;
}

export async function inspectSelector(page: Page, selector: string): Promise<{
  found: boolean;
  count: number;
  elements: ElementInfo[];
}> {
  return await page.evaluate((sel) => {
    const elements = document.querySelectorAll(sel);
    if (elements.length === 0) return { found: false, count: 0, elements: [] };

    const infos: ElementInfo[] = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLInputElement;
      const rect = el.getBoundingClientRect();

      let label = '';
      if (el.id) {
        const labelEl = document.querySelector(`label[for="${el.id}"]`);
        if (labelEl) label = labelEl.textContent?.trim() || '';
      }
      if (!label) {
        const parent = el.closest('.form-group, .k-widget, td, .editor-field');
        if (parent) {
          const labelEl = parent.querySelector('label, .editor-label, .k-label');
          if (labelEl) label = labelEl.textContent?.trim() || '';
        }
      }

      infos.push({
        tagName: el.tagName,
        id: el.id || '',
        name: el.name || '',
        type: el.type || '',
        value: el.value || '',
        visible: rect.width > 0 && rect.height > 0,
        label,
        inModal: !!el.closest('.k-window-content'),
      });
    }

    return { found: true, count: elements.length, elements: infos };
  }, selector);
}

// =============================================================================
// Field Editors
// =============================================================================

export async function editTextField(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    // Use evaluate to find the element inside the modal (avoids matching duplicates outside)
    const result = await page.evaluate((sel, newValue) => {
      const elements = document.querySelectorAll(sel);
      // Prefer element inside modal (.k-window-content)
      let target: HTMLInputElement | null = null;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLInputElement;
        if (el.closest('.k-window-content')) {
          target = el;
          break;
        }
      }
      // Fallback to first element
      if (!target && elements.length > 0) {
        target = elements[0] as HTMLInputElement;
      }
      if (!target) return false;

      // Focus, set value, trigger events
      target.focus();
      target.value = newValue;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, selector, value);

    return result;
  } catch {
    return false;
  }
}

export async function editCheckbox(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    const shouldBeChecked = value.toLowerCase() === 'si' || value.toLowerCase() === 'sí' || value === '1' || value.toLowerCase() === 'true';

    const result = await page.evaluate((sel, shouldCheck) => {
      const checkbox = document.querySelector(sel) as HTMLInputElement;
      if (!checkbox) return false;

      const isChecked = checkbox.checked;
      if (isChecked !== shouldCheck) {
        checkbox.click();
      }

      const hiddenId = checkbox.id + '_hidden';
      const hidden = document.getElementById(hiddenId) as HTMLInputElement;
      if (hidden) {
        hidden.value = shouldCheck ? 'true' : 'false';
      }

      return true;
    }, selector, shouldBeChecked);

    return result;
  } catch {
    return false;
  }
}

export async function editNumericField(page: Page, selector: string, value: number): Promise<boolean> {
  try {
    const result = await page.evaluate((sel, newValue) => {
      const $ = (window as any).jQuery;
      if (!$) return { success: false };

      const element = $(sel);
      if (element.length === 0) return { success: false };

      const numericBox = element.data('kendoNumericTextBox');
      if (numericBox) {
        numericBox.value(newValue);
        numericBox.trigger('change');
        return { success: true };
      }

      // Fallback: normal input
      const input = element[0] as HTMLInputElement;
      if (input) {
        input.value = String(newValue);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true };
      }

      return { success: false };
    }, selector, value);

    return result.success;
  } catch {
    return false;
  }
}

export async function editTextarea(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    const textarea = await page.$(selector);
    if (!textarea) return false;

    await textarea.click();
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.type(value);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Grid Cell Editor (Almacenes)
// =============================================================================

export async function editGridCell(
  page: Page,
  warehouse: string,
  column: string,
  value: number,
): Promise<{ success: boolean; actualValue?: number; error?: string }> {
  try {
    const cellIndex = GRID_COLUMN_INDEX[column];
    if (cellIndex === undefined) {
      return { success: false, error: `Columna "${column}" no tiene índice mapeado` };
    }

    const getCellCoords = async () => {
      return await page.evaluate((warehouseName, colIdx) => {
        const $ = (window as any).jQuery;
        if (!$) return null;

        const gridElement = $('[id*="GridAlmacenes"]');
        if (gridElement.length === 0) return null;

        const grid = gridElement.data('kendoGrid');
        if (!grid) return null;

        const data = grid.dataSource.data();
        for (let i = 0; i < data.length; i++) {
          const item = data[i];
          const nombre = (item.NombreAlmacen || '').toUpperCase();
          if (nombre.includes(warehouseName.toUpperCase())) {
            const rows = gridElement.find('tbody tr.k-master-row');
            const row = rows.eq(i);
            if (row.length === 0) return null;

            const cells = row.find('td:visible');
            const cell = cells.eq(colIdx);
            if (cell.length === 0) return null;

            const rect = cell[0].getBoundingClientRect();
            return {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              almacen: item.NombreAlmacen,
            };
          }
        }
        return null;
      }, warehouse, cellIndex);
    };

    const cellCoords = await getCellCoords();
    if (!cellCoords) {
      return { success: false, error: `Almacén "${warehouse}" o celda no encontrada` };
    }

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      await page.mouse.click(cellCoords.x, cellCoords.y);
      await delay(400);

      const hasInput = await page.evaluate(() => {
        const $ = (window as any).jQuery;
        if (!$) return false;
        const gridElement = $('[id*="GridAlmacenes"]');
        const editCell = gridElement.find('td input.k-input, td input.k-formatted-value, td .k-numerictextbox input');
        return editCell.length > 0;
      });

      if (!hasInput) {
        if (attempt < MAX_RETRIES) {
          await page.mouse.click(cellCoords.x - 200, cellCoords.y);
          await delay(300);
          const newCoords = await getCellCoords();
          if (newCoords) {
            cellCoords.x = newCoords.x;
            cellCoords.y = newCoords.y;
          }
          continue;
        }
        return { success: false, error: `No se activó modo edición después de ${MAX_RETRIES} intentos` };
      }

      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.type(String(value));
      await page.keyboard.press('Tab');
      await delay(300);

      const verifyResult = await page.evaluate((warehouseName, columnName) => {
        const $ = (window as any).jQuery;
        if (!$) return null;
        const gridElement = $('[id*="GridAlmacenes"]');
        const grid = gridElement.data('kendoGrid');
        if (!grid) return null;

        const data = grid.dataSource.data();
        for (let i = 0; i < data.length; i++) {
          const item = data[i];
          const nombre = (item.NombreAlmacen || '').toUpperCase();
          if (nombre.includes(warehouseName.toUpperCase())) {
            return { value: item[columnName], dirty: item.dirty };
          }
        }
        return null;
      }, warehouse, column);

      const actualValue = verifyResult ? Number(verifyResult.value) : undefined;
      if (actualValue !== undefined && actualValue === value) {
        return { success: true, actualValue };
      }

      if (attempt < MAX_RETRIES) {
        await delay(300);
        continue;
      }

      return { success: true, actualValue: actualValue ?? value };
    }

    return { success: false, error: 'Agotados reintentos' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// =============================================================================
// Dropdown Editors
// =============================================================================

export async function editDropdownWithClick(
  page: Page,
  selector: string,
  value: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const wrapperSelector = await page.evaluate((sel) => {
      const $ = (window as any).jQuery;
      const element = $(sel);
      if (element.length === 0) return null;
      const dropdown = element.data('kendoDropDownList');
      if (!dropdown) return null;
      const wrapper = dropdown.wrapper;
      if (wrapper && wrapper.length > 0) {
        const tempId = 'temp-dropdown-' + Date.now();
        wrapper.attr('id', tempId);
        return '#' + tempId;
      }
      return null;
    }, selector);

    if (!wrapperSelector) {
      return { success: false, error: 'No se encontró el wrapper del dropdown' };
    }

    await page.click(wrapperSelector);
    await delay(1000);

    // Ensure dropdown is open
    await page.evaluate((sel) => {
      const $ = (window as any).jQuery;
      const dropdown = $(sel).data('kendoDropDownList');
      if (dropdown) {
        const popup = dropdown.popup;
        if (!popup || !popup.visible || !popup.visible()) {
          dropdown.open();
        }
      }
    }, selector);

    await delay(1500);

    const result = await page.evaluate((searchValue, sel) => {
      const $ = (window as any).jQuery;

      const selectors = [
        '.k-animation-container:visible li.k-item',
        '.k-animation-container:visible li',
        '.k-popup:visible li',
        '.k-list:visible li',
        '[aria-hidden="false"] li',
      ];

      let listbox = $();
      for (const s of selectors) {
        listbox = $(s);
        if (listbox.length > 0) break;
      }

      if (listbox.length > 0) {
        for (let i = 0; i < listbox.length; i++) {
          const li = listbox.eq(i);
          const text = li.text().trim();
          if (text.toLowerCase().includes(searchValue.toLowerCase())) {
            li.click();
            return { success: true, method: 'li_click' };
          }
        }
      }

      // Fallback: Kendo API
      const dropdown = $(sel).data('kendoDropDownList');
      if (!dropdown) {
        return { success: false, error: 'No dropdown found for fallback' };
      }

      const dataSource = dropdown.dataSource;
      const data = dataSource.data();
      const available: string[] = [];

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const text = (item.Text || item.Nombre || item.Nom || item.text || item.nombre || '').toString();
        available.push(text);

        if (text.toLowerCase().includes(searchValue.toLowerCase())) {
          dropdown.select(i);
          dropdown.trigger('change');
          return { success: true, method: 'kendo_api' };
        }
      }

      return { success: false, error: `Valor "${searchValue}" no encontrado (${data.length} opciones: ${available.join(', ')})` };
    }, value, selector);

    await delay(1000);
    return result;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function editDropdown(
  page: Page,
  selector: string,
  value: string,
  isCascade: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (isCascade) {
      await delay(5000);
      return await editDropdownWithClick(page, selector, value);
    }

    const result = await page.evaluate((sel, newValue) => {
      const $ = (window as any).jQuery;
      if (!$) return { success: false, error: 'jQuery not found' };

      const element = $(sel);
      if (element.length === 0) return { success: false, error: 'Element not found' };

      const dropdown = element.data('kendoDropDownList');
      if (!dropdown) return { success: false, error: 'Kendo DropDownList not initialized' };

      const dataSource = dropdown.dataSource;
      const data = dataSource.data();

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const text = (item.Text || item.Nombre || item.Nom || item.text || item.nombre || '').toString().toLowerCase();
        const val = (item.Value || item.Id || item.value || item.id || '').toString();

        if (text.includes(newValue.toLowerCase()) || val === newValue) {
          dropdown.select(i);
          const nativeElement = element[0];
          if (nativeElement) {
            nativeElement.value = val;
            nativeElement.dispatchEvent(new Event('change', { bubbles: true }));
          }
          dropdown.trigger('change');
          return { success: true };
        }
      }

      const availableOptions = data.slice(0, 5).map((d: any) => d.Text || d.Nombre || d.Nom || 'N/A');
      return { success: false, error: `Valor "${newValue}" no encontrado (${data.length} opciones: ${availableOptions.join(', ')})` };
    }, selector, value);

    if (result.success) {
      await delay(500);
      // Force cascade reload on child dropdowns
      await page.evaluate((sel) => {
        const $ = (window as any).jQuery;
        const element = $(sel);
        const parentDropdown = element.data('kendoDropDownList');
        if (!parentDropdown) return;

        const parentId = element.attr('id');

        $('[data-role="dropdownlist"]').each(function(i: number, el: HTMLElement) {
          const $el = $(el);
          const dropdown = $el.data('kendoDropDownList');
          if (dropdown && dropdown.options && dropdown.options.cascadeFrom) {
            const cascadeFrom = dropdown.options.cascadeFrom;
            if (cascadeFrom === parentId || cascadeFrom.endsWith('_' + parentId) || parentId?.endsWith('_' + cascadeFrom.split('_').pop())) {
              if (dropdown.dataSource) {
                dropdown.dataSource.read();
              }
            }
          }
        });
      }, selector);
      await delay(2000);
    }

    return result;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// =============================================================================
// Tarifa Grid Editor
// =============================================================================

export async function editTarifaCell(
  page: Page,
  tarifaName: string,
  column: string,
  value: number,
): Promise<{ success: boolean; actualValue?: number }> {
  const result = await page.evaluate((tarifa, columnName, newValue) => {
    const $ = (window as any).jQuery;
    if (!$) return { success: false };

    const gridElement = $('[id*="GridTarifas"]');
    if (gridElement.length === 0) return { success: false };

    const grid = gridElement.data('kendoGrid');
    if (!grid) return { success: false };

    const data = grid.dataSource.data();
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const nombre = (item.NomTarifa || '').toLowerCase();
      if (nombre.includes(tarifa.toLowerCase())) {
        item.set(columnName, newValue);
        item.dirty = true;
        return { success: true, actualValue: item[columnName] };
      }
    }

    return { success: false };
  }, tarifaName, column, value);

  return { success: result.success, actualValue: result.actualValue };
}

// =============================================================================
// Save & Close
// =============================================================================

export async function saveArticle(page: Page): Promise<boolean> {
  try {
    const saved = await page.evaluate(() => {
      const modal = document.querySelector('.k-window-content') || document;

      const guardarBtn = modal.querySelector('button.guardar, [id$="_guardar"]');
      if (guardarBtn) {
        (guardarBtn as HTMLElement).click();
        return true;
      }

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
    return saved;
  } catch {
    return false;
  }
}

export async function closeArticle(page: Page): Promise<void> {
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

    const modalStillOpen = await page.$('.k-window-content');
    if (modalStillOpen) {
      await page.keyboard.press('Escape');
      await delay(1000);
    }
  } catch {
    // Ignore
  }
}
