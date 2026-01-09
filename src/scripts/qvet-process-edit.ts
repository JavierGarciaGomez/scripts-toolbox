/**
 * QVET Process Edit - v2
 *
 * Lee un Excel con hojas "Original" y "Editar", detecta los cambios,
 * y los aplica en QVET usando Puppeteer con APIs de Kendo UI.
 *
 * Campos soportados:
 * - Datos Generales: Descripcion1, Descripcion2, Referencia, checkboxes
 * - Almacenes: Stock Mínimo, Stock Óptimo (via Kendo Grid DataSource API)
 * - Observaciones: textarea
 *
 * Uso:
 *   npx ts-node src/scripts/qvet-process-edit.ts data/qvet/articulos-TIMESTAMP.xlsx
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Cargar .env
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
  console.log('⚠️  No se pudo cargar .env');
}

const QVET_USER = process.env.QVET_USER || '';
const QVET_PASS = process.env.QVET_PASS || '';
const QVET_AUTO = process.env.QVET_AUTO || '';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// =============================================================================
// Tipos
// =============================================================================

interface Change {
  idArticulo: number;
  field: string;
  oldValue: any;
  newValue: any;
  tab: string;
  fieldType: FieldType;
  gridConfig?: { warehouse: string; column: string };
  tarifaConfig?: { tarifaName: string; column: string };
}

interface ChangeResult {
  idArticulo: number;
  field: string;
  oldValue: any;
  newValue: any;
  attemptedValue: any;
  actualValue?: any;
  status: 'success' | 'error' | 'skipped' | 'verify_failed';
  error?: string | undefined;
}

interface ProcessReport {
  timestamp: string;
  excelFile: string;
  totalChanges: number;
  successful: number;
  failed: number;
  skipped: number;
  verifyFailed: number;
  changes: ChangeResult[];
  summary: {
    byField: Record<string, { total: number; success: number; failed: number }>;
    byArticle: Record<number, { total: number; success: number; failed: number }>;
  };
}

// Tipos de campo extendidos
type FieldType = 'text' | 'checkbox' | 'dropdown' | 'grid' | 'textarea' | 'tarifa' | 'numeric';

// Configuración de campo
interface FieldConfig {
  field: string;
  tab: string;
  type: FieldType;
  selector?: string;
  gridConfig?: { warehouse: string; column: string };
  tarifaConfig?: { tarifaName: string; column: string };
}

// Mapeo completo de columnas Excel a campos QVET
const COLUMN_MAP: Record<string, FieldConfig> = {
  // ==========================================================================
  // DATOS GENERALES - Textos
  // ==========================================================================
  'DESCRIPCION': { field: 'Descripcio1', tab: 'Datos generales', type: 'text', selector: '[id$="_Descripcio1"]' },
  'Descripcion_1': { field: 'Descripcio1', tab: 'Datos generales', type: 'text', selector: '[id$="_Descripcio1"]' },
  'DESCRIPCION2': { field: 'Descripcio2', tab: 'Datos generales', type: 'text', selector: '[id$="_Descripcio2"]' },
  'Descripcion_2': { field: 'Descripcio2', tab: 'Datos generales', type: 'text', selector: '[id$="_Descripcio2"]' },
  'REFERENCIA': { field: 'Referencia', tab: 'Datos generales', type: 'text', selector: '[id$="_Referencia"]' },
  'CODIGO BARRAS': { field: 'CodiBarres', tab: 'Datos generales', type: 'text', selector: '[id$="_CodiBarres"]' },
  'CODIGO ALTERNATIVO': { field: 'CodigoAlternativo', tab: 'Datos generales', type: 'text', selector: '[id$="_CodigoAlternativo"]' },

  // ==========================================================================
  // DATOS GENERALES - Checkboxes
  // ==========================================================================
  'ACTIVO': { field: 'Actiu', tab: 'Datos generales', type: 'checkbox', selector: '[id$="_Actiu"]' },
  'Activo': { field: 'Actiu', tab: 'Datos generales', type: 'checkbox', selector: '[id$="_Actiu"]' },
  'VISIBLE_VENTAS': { field: 'ArticleVenta', tab: 'Datos generales', type: 'checkbox', selector: '[id$="_ArticleVenta"]' },
  'Visible_Ventas': { field: 'ArticleVenta', tab: 'Datos generales', type: 'checkbox', selector: '[id$="_ArticleVenta"]' },
  'VISIBLE_COMPRAS': { field: 'ArticleCompra', tab: 'Datos generales', type: 'checkbox', selector: '[id$="_ArticleCompra"]' },
  'Visible_Compras': { field: 'ArticleCompra', tab: 'Datos generales', type: 'checkbox', selector: '[id$="_ArticleCompra"]' },
  'SOLO_ESCANDALLO': { field: 'ArticleVentaSoloEnEscandallo', tab: 'Datos generales', type: 'checkbox', selector: '[id$="_ArticleVentaSoloEnEscandallo"]' },
  'Solo_Escandallo': { field: 'ArticleVentaSoloEnEscandallo', tab: 'Datos generales', type: 'checkbox', selector: '[id$="_ArticleVentaSoloEnEscandallo"]' },

  // ==========================================================================
  // DATOS GENERALES - Dropdowns (Kendo DropDownList)
  // ==========================================================================
  // NOTA: Sección, Familia, Subfamilia son dropdowns cascada que NO están soportados
  // debido a la complejidad de su interacción (requieren selección manual)
  'MARCA': { field: 'IdMarca', tab: 'Datos generales', type: 'dropdown', selector: '#IdMarca, [id$="_IdMarca"]' },
  'Marca': { field: 'IdMarca', tab: 'Datos generales', type: 'dropdown', selector: '#IdMarca, [id$="_IdMarca"]' },

  // ==========================================================================
  // PRECIOS - Campos numéricos
  // ==========================================================================
  'P_MINIMO': { field: 'PrecioMinimo', tab: 'Precios compras / ventas', type: 'text', selector: '[id$="_PrecioMinimo"]' },
  'P_Minimo': { field: 'PrecioMinimo', tab: 'Precios compras / ventas', type: 'text', selector: '[id$="_PrecioMinimo"]' },
  'UPC_BI': { field: 'UltimoPrecioCompra', tab: 'Precios compras / ventas', type: 'numeric', selector: '[id$="_UltimoPrecioCompra"]' },
  'Upc_Bi': { field: 'UltimoPrecioCompra', tab: 'Precios compras / ventas', type: 'numeric', selector: '[id$="_UltimoPrecioCompra"]' },

  // ==========================================================================
  // PRECIOS - Dropdowns IVA
  // ==========================================================================
  'IMP_VENTAS': { field: 'IVA_Id', tab: 'Precios compras / ventas', type: 'dropdown', selector: '[id$="_IVA_Id"]' },
  'Imp_Ventas': { field: 'IVA_Id', tab: 'Precios compras / ventas', type: 'dropdown', selector: '[id$="_IVA_Id"]' },
  'IMP_COMPRAS': { field: 'IVACompra_Id', tab: 'Precios compras / ventas', type: 'dropdown', selector: '[id$="_IVACompra_Id"]' },
  'Imp_Compras': { field: 'IVACompra_Id', tab: 'Precios compras / ventas', type: 'dropdown', selector: '[id$="_IVACompra_Id"]' },

  // ==========================================================================
  // TARIFAS - Grid de Tarifas (Tarifa Ordinaria)
  // ==========================================================================
  'Tarifa_Ord_PVP': { field: 'PreuUnitari', tab: 'Precios compras / ventas', type: 'tarifa', tarifaConfig: { tarifaName: 'ordinaria', column: 'PreuUnitari' } },
  'Tarifa_Ord_MargenC': { field: 'MargenCompras', tab: 'Precios compras / ventas', type: 'tarifa', tarifaConfig: { tarifaName: 'ordinaria', column: 'MargenCompras' } },
  'Tarifa_Ord_MargenV': { field: 'MargenVentas', tab: 'Precios compras / ventas', type: 'tarifa', tarifaConfig: { tarifaName: 'ordinaria', column: 'MargenVentas' } },
  // Aliases para compatibilidad
  'Tarifa_PVP': { field: 'PreuUnitari', tab: 'Precios compras / ventas', type: 'tarifa', tarifaConfig: { tarifaName: 'ordinaria', column: 'PreuUnitari' } },
  'Tarifa_MargenC': { field: 'MargenCompras', tab: 'Precios compras / ventas', type: 'tarifa', tarifaConfig: { tarifaName: 'ordinaria', column: 'MargenCompras' } },
  'Tarifa_MargenV': { field: 'MargenVentas', tab: 'Precios compras / ventas', type: 'tarifa', tarifaConfig: { tarifaName: 'ordinaria', column: 'MargenVentas' } },

  // ==========================================================================
  // TARIFAS - Grid de Tarifas (Tarifa Mínima)
  // ==========================================================================
  'Tarifa_Min_PVP': { field: 'PreuUnitari', tab: 'Precios compras / ventas', type: 'tarifa', tarifaConfig: { tarifaName: 'minima', column: 'PreuUnitari' } },
  'Tarifa_Min_MargenC': { field: 'MargenCompras', tab: 'Precios compras / ventas', type: 'tarifa', tarifaConfig: { tarifaName: 'minima', column: 'MargenCompras' } },
  'Tarifa_Min_MargenV': { field: 'MargenVentas', tab: 'Precios compras / ventas', type: 'tarifa', tarifaConfig: { tarifaName: 'minima', column: 'MargenVentas' } },

  // ==========================================================================
  // ALMACENES - Stock via Kendo Grid API
  // ==========================================================================
  'Stock_Min_Harbor': { field: 'StockMinimo', tab: 'Almacenes', type: 'grid', gridConfig: { warehouse: 'HARBOR', column: 'StockMinimo' } },
  'Stock_Opt_Harbor': { field: 'StockMaximo', tab: 'Almacenes', type: 'grid', gridConfig: { warehouse: 'HARBOR', column: 'StockMaximo' } },
  'Compra_Min_Harbor': { field: 'CompraMinima', tab: 'Almacenes', type: 'grid', gridConfig: { warehouse: 'HARBOR', column: 'CompraMinima' } },
  'Stock_Min_Montejo': { field: 'StockMinimo', tab: 'Almacenes', type: 'grid', gridConfig: { warehouse: 'MONTEJO', column: 'StockMinimo' } },
  'Stock_Opt_Montejo': { field: 'StockMaximo', tab: 'Almacenes', type: 'grid', gridConfig: { warehouse: 'MONTEJO', column: 'StockMaximo' } },
  'Compra_Min_Montejo': { field: 'CompraMinima', tab: 'Almacenes', type: 'grid', gridConfig: { warehouse: 'MONTEJO', column: 'CompraMinima' } },
  'Stock_Min_Urban': { field: 'StockMinimo', tab: 'Almacenes', type: 'grid', gridConfig: { warehouse: 'URBAN', column: 'StockMinimo' } },
  'Stock_Opt_Urban': { field: 'StockMaximo', tab: 'Almacenes', type: 'grid', gridConfig: { warehouse: 'URBAN', column: 'StockMaximo' } },
  'Compra_Min_Urban': { field: 'CompraMinima', tab: 'Almacenes', type: 'grid', gridConfig: { warehouse: 'URBAN', column: 'CompraMinima' } },

  // ==========================================================================
  // OBSERVACIONES
  // ==========================================================================
  'Observaciones': { field: 'Observacions', tab: 'Observaciones', type: 'textarea', selector: '#Observacions' },
  'OBSERVACIONES': { field: 'Observacions', tab: 'Observaciones', type: 'textarea', selector: '#Observacions' },
};

// =============================================================================
// Funciones de Excel
// =============================================================================

function readExcelSheets(filePath: string): { original: any[][]; editar: any[][] } {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });

  const originalSheet = workbook.Sheets['Original'];
  const editarSheet = workbook.Sheets['Editar'];

  if (!originalSheet || !editarSheet) {
    throw new Error('El Excel debe tener hojas "Original" y "Editar"');
  }

  const original = XLSX.utils.sheet_to_json(originalSheet, { header: 1 }) as any[][];
  const editar = XLSX.utils.sheet_to_json(editarSheet, { header: 1 }) as any[][];

  return { original, editar };
}

function detectChanges(original: any[][], editar: any[][]): Change[] {
  const changes: Change[] = [];
  const editHeaders = editar[0] as string[];

  // Encontrar columna ID
  const idColIndex = editHeaders.findIndex(h => {
    const header = h?.toString().toLowerCase() || '';
    return header.includes('codigo interno') || header.includes('idarticulo') || header === 'id';
  });

  if (idColIndex === -1) {
    throw new Error('No se encontró columna de ID en el Excel');
  }

  console.log(`   📍 Columna ID: "${editHeaders[idColIndex]}" (índice ${idColIndex})`);

  // Comparar fila por fila
  for (let rowIndex = 1; rowIndex < editar.length; rowIndex++) {
    const editRow = editar[rowIndex];
    const origRow = original[rowIndex];

    if (!editRow || !origRow) continue;

    const idArticulo = parseInt(editRow[idColIndex]);
    if (isNaN(idArticulo)) continue;

    // Comparar cada columna
    for (let colIndex = 0; colIndex < editHeaders.length; colIndex++) {
      const header = editHeaders[colIndex];
      if (!header) continue;

      const oldValue = origRow[colIndex];
      const newValue = editRow[colIndex];

      // Normalizar para comparación
      const oldNorm = oldValue === undefined || oldValue === null ? '' : String(oldValue).trim();
      const newNorm = newValue === undefined || newValue === null ? '' : String(newValue).trim();

      if (oldNorm !== newNorm) {
        const mapping = COLUMN_MAP[header];

        if (mapping) {
          const change: Change = {
            idArticulo,
            field: header,
            oldValue: oldNorm,
            newValue: newNorm,
            tab: mapping.tab,
            fieldType: mapping.type,
          };
          // Solo asignar gridConfig si existe
          if (mapping.gridConfig) {
            change.gridConfig = mapping.gridConfig;
          }
          // Solo asignar tarifaConfig si existe
          if (mapping.tarifaConfig) {
            change.tarifaConfig = mapping.tarifaConfig;
          }
          changes.push(change);
        }
      }
    }
  }

  return changes;
}

// =============================================================================
// Funciones de Puppeteer
// =============================================================================

async function loginQVET(page: Page): Promise<boolean> {
  console.log('🔐 Iniciando login...');

  try {
    await page.goto('https://go.qvet.net/', { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);

    await page.waitForSelector('#Clinica', { timeout: 15000 });
    await page.type('#Clinica', QVET_AUTO, { delay: 80 });
    await delay(300);
    await page.type('#UserName', QVET_USER, { delay: 80 });
    await delay(300);
    await page.type('#Password', QVET_PASS, { delay: 80 });
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
        await page.evaluate(() => {
          const items = document.querySelectorAll('#IdCentro_listbox li');
          if (items.length > 0) (items[0] as HTMLElement).click();
        });
        await delay(1500);

        await page.click('#btnLogin');
        await delay(5000);
      } catch (e: any) {
        console.log(`   Error en AutoLogin: ${e.message}`);
      }
    }

    const finalUrl = page.url();
    if (finalUrl.includes('/Home') || finalUrl.includes('Index')) {
      console.log('   ✅ Login exitoso\n');
      return true;
    }

    return false;
  } catch (e: any) {
    console.log(`   ❌ Error en login: ${e.message}`);
    return false;
  }
}

async function navigateToArticles(page: Page): Promise<boolean> {
  try {
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

    if (clicked) {
      await delay(3000);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function openArticle(page: Page, idArticulo: number): Promise<boolean> {
  try {
    const searchField = await page.$('input[name*="IdArticulo"]') as any;
    if (searchField) {
      await searchField.click({ clickCount: 3 });
      await page.keyboard.type(String(idArticulo));
      await page.keyboard.press('Enter');
      await delay(2000);
    }

    const row = await page.$('.k-grid-content tr');
    if (row) {
      await row.click({ clickCount: 2 });
    }
    await delay(3000);

    await page.waitForSelector('.k-window-content, .FichaArticulo', { timeout: 10000 });
    return true;
  } catch (e: any) {
    return false;
  }
}

async function selectTab(page: Page, tabName: string): Promise<boolean> {
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

// Editar campo de texto
async function editTextField(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    const input = await page.$(selector);
    if (!input) return false;

    await input.click({ clickCount: 3 });
    await delay(100);
    await page.keyboard.type(value);
    return true;
  } catch (e) {
    return false;
  }
}

// Editar checkbox
async function editCheckbox(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    const shouldBeChecked = value.toLowerCase() === 'si' || value.toLowerCase() === 'sí' || value === '1' || value.toLowerCase() === 'true';

    const result = await page.evaluate((sel, shouldCheck) => {
      const checkbox = document.querySelector(sel) as HTMLInputElement;
      if (!checkbox) return false;

      const isChecked = checkbox.checked;
      if (isChecked !== shouldCheck) {
        checkbox.click();
      }

      // Update hidden field
      const hiddenId = checkbox.id + '_hidden';
      const hidden = document.getElementById(hiddenId) as HTMLInputElement;
      if (hidden) {
        hidden.value = shouldCheck ? 'true' : 'false';
      }

      return true;
    }, selector, shouldBeChecked);

    return result;
  } catch (e) {
    return false;
  }
}

// Editar campo numérico Kendo NumericTextBox
async function editNumericField(page: Page, selector: string, value: number): Promise<boolean> {
  try {
    const result = await page.evaluate((sel, newValue) => {
      const $ = (window as any).jQuery;
      if (!$) return { success: false, error: 'jQuery not found' };

      const element = $(sel);
      if (element.length === 0) return { success: false, error: 'Element not found' };

      const numericBox = element.data('kendoNumericTextBox');
      if (numericBox) {
        // Usar Kendo NumericTextBox API
        numericBox.value(newValue);
        numericBox.trigger('change');
        return { success: true, actualValue: numericBox.value() };
      }

      // Fallback: intentar como input normal
      const input = element[0] as HTMLInputElement;
      if (input) {
        input.value = String(newValue);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, actualValue: input.value };
      }

      return { success: false, error: 'Could not set value' };
    }, selector, value);

    return result.success;
  } catch (e) {
    return false;
  }
}

// Editar textarea
async function editTextarea(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    const textarea = await page.$(selector);
    if (!textarea) return false;

    await textarea.click();
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.type(value);
    return true;
  } catch (e) {
    return false;
  }
}

// Editar celda de grid usando Kendo DataSource API (FIX del bug)
async function editGridCell(page: Page, warehouse: string, column: string, value: number): Promise<{ success: boolean; actualValue?: number }> {
  const result = await page.evaluate((warehouseName, columnName, newValue) => {
    const $ = (window as any).jQuery;
    if (!$) return { success: false, error: 'jQuery not found' };

    const gridElement = $('[id*="GridAlmacenes"]');
    if (gridElement.length === 0) return { success: false, error: 'Grid not found' };

    const grid = gridElement.data('kendoGrid');
    if (!grid) return { success: false, error: 'Kendo Grid not initialized' };

    const dataSource = grid.dataSource;
    const data = dataSource.data();

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const nombre = (item.NombreAlmacen || '').toUpperCase();
      if (nombre.includes(warehouseName.toUpperCase())) {
        // Usar set() para que Kendo detecte el cambio
        item.set(columnName, newValue);
        item.dirty = true;

        return {
          success: true,
          actualValue: item[columnName],
          almacen: item.NombreAlmacen
        };
      }
    }

    return { success: false, error: `Almacén "${warehouseName}" no encontrado` };
  }, warehouse, column, value);

  return { success: result.success, actualValue: result.actualValue };
}

// Editar dropdown cascada simulando clicks reales del usuario
async function editDropdownWithClick(page: Page, selector: string, value: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`         [DEBUG] editDropdownWithClick: selector=${selector}, value=${value}`);

    // Info del dropdown antes de abrir
    const dropdownInfo = await page.evaluate((sel) => {
      const $ = (window as any).jQuery;
      const element = $(sel);
      if (element.length === 0) return { exists: false, selector: sel };
      const dropdown = element.data('kendoDropDownList');
      if (!dropdown) return { exists: true, hasKendo: false };

      const ds = dropdown.dataSource;
      const data = ds ? ds.data() : [];

      // También buscar el elemento padre si existe cascadeFrom
      let parentInfo = null;
      if (dropdown.options?.cascadeFrom) {
        const parentId = dropdown.options.cascadeFrom;
        const parentEl = $('#' + parentId);
        if (parentEl.length > 0) {
          const parentDd = parentEl.data('kendoDropDownList');
          parentInfo = {
            id: parentId,
            exists: true,
            value: parentDd ? parentDd.value() : 'no kendo',
            text: parentDd ? parentDd.text() : 'no kendo'
          };
        } else {
          parentInfo = { id: parentId, exists: false };
        }
      }

      return {
        exists: true,
        hasKendo: true,
        elementId: element.attr('id'),
        dataLength: data.length,
        currentValue: dropdown.value(),
        currentText: dropdown.text(),
        isEnabled: dropdown.enable ? 'enabled' : 'unknown',
        cascadeFrom: dropdown.options?.cascadeFrom || 'none',
        parentInfo
      };
    }, selector);
    console.log(`         [DEBUG] Dropdown info:`, JSON.stringify(dropdownInfo));

    // Encontrar el wrapper del dropdown y hacer click real
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

    console.log(`         [DEBUG] Clicking wrapper: ${wrapperSelector}`);

    // Click real con Puppeteer
    await page.click(wrapperSelector);
    await delay(1000);

    // Verificar si se abrió el dropdown
    const isOpen = await page.evaluate((sel) => {
      const $ = (window as any).jQuery;
      const dropdown = $(sel).data('kendoDropDownList');
      if (!dropdown) return { isOpen: false, error: 'no dropdown' };

      // Verificar si el popup está abierto
      const popup = dropdown.popup;
      const isOpen = popup && popup.visible && popup.visible();

      // Si no está abierto, intentar abrir manualmente
      if (!isOpen) {
        dropdown.open();
      }

      return {
        isOpen,
        opened: !isOpen ? 'forced open' : 'already open',
        dataLength: dropdown.dataSource.data().length
      };
    }, selector);
    console.log(`         [DEBUG] Dropdown open status:`, JSON.stringify(isOpen));

    await delay(1500); // Esperar a que se abra y carguen opciones

    // Verificar qué elementos visibles hay - probar varios selectores
    const visibleInfo = await page.evaluate(() => {
      const $ = (window as any).jQuery;

      // Diferentes selectores posibles para los items del dropdown
      const selectors = [
        '.k-animation-container:visible li',
        '.k-animation-container:visible .k-item',
        '.k-list-container:visible li',
        '.k-popup:visible li',
        '[aria-hidden="false"] li',
        '.k-list:visible li'
      ];

      const results: Record<string, number> = {};
      let bestSelector = '';
      let maxCount = 0;

      for (const sel of selectors) {
        const count = $(sel).length;
        results[sel] = count;
        if (count > maxCount) {
          maxCount = count;
          bestSelector = sel;
        }
      }

      const bestItems = $(bestSelector);
      const texts: string[] = [];
      for (let i = 0; i < Math.min(5, bestItems.length); i++) {
        texts.push(bestItems.eq(i).text().trim());
      }

      return { selectors: results, bestSelector, bestCount: maxCount, texts };
    });
    console.log(`         [DEBUG] Selector analysis:`, JSON.stringify(visibleInfo));

    // Buscar la opción - primero intentar via LI visibles, luego via Kendo API
    const result = await page.evaluate((searchValue, sel) => {
      const $ = (window as any).jQuery;

      // Probar múltiples selectores para LI visibles
      const selectors = [
        '.k-animation-container:visible li.k-item',
        '.k-animation-container:visible li',
        '.k-popup:visible li',
        '.k-list:visible li',
        '[aria-hidden="false"] li'
      ];

      let listbox = $();
      for (const s of selectors) {
        listbox = $(s);
        if (listbox.length > 0) break;
      }

      // Intentar click en LI si hay elementos visibles
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

      // FALLBACK: Usar Kendo API directamente si no hay LI visibles
      console.log('[FALLBACK] No visible LI found, using Kendo API directly');
      const dropdown = $(sel).data('kendoDropDownList');
      if (!dropdown) {
        return { success: false, error: 'No dropdown found for Kendo API fallback' };
      }

      const dataSource = dropdown.dataSource;
      const data = dataSource.data();
      const available: string[] = [];

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const text = (item.Text || item.Nombre || item.Nom || item.text || item.nombre || '').toString();
        available.push(text);

        if (text.toLowerCase().includes(searchValue.toLowerCase())) {
          // Seleccionar por índice usando la API de Kendo
          dropdown.select(i);
          dropdown.trigger('change');
          return { success: true, method: 'kendo_api', selectedText: text, selectedIndex: i };
        }
      }

      return { success: false, error: `Valor "${searchValue}" no encontrado (${data.length} opciones: ${available.join(', ')})`, method: 'fallback_failed' };
    }, value, selector);

    console.log(`         [DEBUG] Result:`, JSON.stringify(result));

    await delay(1000);
    // NO presionar Escape - puede cerrar el formulario completo

    // Verificar que el valor se seleccionó correctamente
    if (result.success) {
      const verification = await page.evaluate((sel, expectedValue) => {
        const $ = (window as any).jQuery;
        const dropdown = $(sel).data('kendoDropDownList');
        if (!dropdown) return { verified: false, error: 'no dropdown' };
        const currentText = dropdown.text();
        const currentValue = dropdown.value();

        // Si es Seccio_Id, también actualizar IdSeccion para disparar la cascada
        if (sel.includes('Seccio_Id')) {
          const idSeccionEl = $('[id$="_IdSeccion"]');
          if (idSeccionEl.length > 0) {
            const idSeccionDd = idSeccionEl.data('kendoDropDownList');
            if (idSeccionDd) {
              // Copiar el valor de Seccio_Id a IdSeccion
              idSeccionDd.value(currentValue);
              idSeccionDd.trigger('change');
              console.log('[SYNC] Synced IdSeccion with value:', currentValue);
            }
          }
        }

        return {
          verified: currentText.toLowerCase().includes(expectedValue.toLowerCase()),
          currentText,
          currentValue
        };
      }, selector, value);
      console.log(`         [DEBUG] Verification:`, JSON.stringify(verification));

      await delay(3000); // Esperar más para la cascada
    }

    return result;
  } catch (e: any) {
    console.log(`         [DEBUG] Error:`, e.message);
    return { success: false, error: e.message };
  }
}

// Editar dropdown usando Kendo DropDownList API
async function editDropdown(page: Page, selector: string, value: string, isCascade: boolean = false): Promise<{ success: boolean; error?: string }> {
  try {
    // Para dropdowns cascada, usar el método con click que es más confiable
    if (isCascade) {
      // Esperar a que el padre haya disparado el cascade
      console.log(`         [DEBUG] Esperando 5s para cascade...`);
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

      // Buscar por texto o valor
      const dataSource = dropdown.dataSource;
      const data = dataSource.data();

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        // Buscar en diferentes campos de texto posibles
        const text = (item.Text || item.Nombre || item.Nom || item.text || item.nombre || '').toString().toLowerCase();
        const val = (item.Value || item.Id || item.value || item.id || '').toString();

        if (text.includes(newValue.toLowerCase()) || val === newValue) {
          // Usar select() que es más completo y dispara todos los eventos
          dropdown.select(i);
          // También disparar change en el elemento nativo por si acaso
          const nativeElement = element[0];
          if (nativeElement) {
            nativeElement.value = val;
            nativeElement.dispatchEvent(new Event('change', { bubbles: true }));
          }
          // Y también en el widget
          dropdown.trigger('change');
          return { success: true, selectedValue: val, selectedText: item.Text || item.Nombre || item.Nom };
        }
      }

      // Debug: return available options
      const availableOptions = data.slice(0, 5).map((d: any) => d.Text || d.Nombre || d.Nom || 'N/A');
      return { success: false, error: `Valor "${newValue}" no encontrado en dropdown (${data.length} opciones: ${availableOptions.join(', ')})` };
    }, selector, value);

    // Si cambió exitosamente, forzar la cascada en dropdowns hijo
    if (result.success) {
      await delay(500);

      // Forzar recarga de dropdowns que dependen de este
      await page.evaluate((sel) => {
        const $ = (window as any).jQuery;
        const element = $(sel);
        const parentDropdown = element.data('kendoDropDownList');
        if (!parentDropdown) return;

        const parentId = element.attr('id');
        const parentValue = parentDropdown.value();

        // Buscar dropdowns que cascaden de este
        $('[data-role="dropdownlist"]').each(function(i: number, el: HTMLElement) {
          const $el = $(el);
          const dropdown = $el.data('kendoDropDownList');
          if (dropdown && dropdown.options && dropdown.options.cascadeFrom) {
            const cascadeFrom = dropdown.options.cascadeFrom;
            // Verificar si este dropdown cascadea del padre
            if (cascadeFrom === parentId || cascadeFrom.endsWith('_' + parentId) || parentId?.endsWith('_' + cascadeFrom.split('_').pop())) {
              console.log('[CASCADE] Forcing reload of:', $el.attr('id'), 'cascadeFrom:', cascadeFrom);
              // Forzar recarga del dataSource
              if (dropdown.dataSource) {
                dropdown.dataSource.read();
              }
            }
          }
        });
      }, selector);

      await delay(2000); // Dar tiempo a que se carguen los datos
    }

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error || 'Unknown error' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Editar celda en grid de Tarifas usando Kendo DataSource API
async function editTarifaCell(page: Page, tarifaName: string, column: string, value: number): Promise<{ success: boolean; actualValue?: number }> {
  const result = await page.evaluate((tarifa, columnName, newValue) => {
    const $ = (window as any).jQuery;
    if (!$) return { success: false, error: 'jQuery not found' };

    const gridElement = $('[id*="GridTarifas"]');
    if (gridElement.length === 0) return { success: false, error: 'GridTarifas not found' };

    const grid = gridElement.data('kendoGrid');
    if (!grid) return { success: false, error: 'Kendo Grid not initialized' };

    const dataSource = grid.dataSource;
    const data = dataSource.data();

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const nombre = (item.NomTarifa || '').toLowerCase();
      if (nombre.includes(tarifa.toLowerCase())) {
        // Usar set() para que Kendo detecte el cambio
        item.set(columnName, newValue);
        item.dirty = true;

        return {
          success: true,
          actualValue: item[columnName],
          tarifa: item.NomTarifa
        };
      }
    }

    return { success: false, error: `Tarifa "${tarifa}" no encontrada` };
  }, tarifaName, column, value);

  return { success: result.success, actualValue: result.actualValue };
}

// Guardar artículo
async function saveArticle(page: Page): Promise<boolean> {
  try {
    // Buscar botón guardar
    const saved = await page.evaluate(() => {
      const modal = document.querySelector('.k-window-content') || document;

      // Buscar por clase
      const guardarBtn = modal.querySelector('button.guardar, [id$="_guardar"]');
      if (guardarBtn) {
        (guardarBtn as HTMLElement).click();
        return true;
      }

      // Buscar por texto
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
  } catch (e) {
    return false;
  }
}

// Cerrar artículo y liberar bloqueo
async function closeArticle(page: Page): Promise<void> {
  try {
    await page.keyboard.press('Escape');
    await delay(1000);
    await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await delay(2000);
  } catch (e) {
    // Ignorar
  }
}

// =============================================================================
// Aplicar cambios con verificación
// =============================================================================

async function applyChanges(page: Page, changes: Change[]): Promise<ChangeResult[]> {
  const results: ChangeResult[] = [];

  // Agrupar por artículo
  const changesByArticle = new Map<number, Change[]>();
  for (const change of changes) {
    const existing = changesByArticle.get(change.idArticulo) || [];
    existing.push(change);
    changesByArticle.set(change.idArticulo, existing);
  }

  console.log(`\n📝 Aplicando cambios a ${changesByArticle.size} artículos...\n`);

  let articleIndex = 0;
  for (const [idArticulo, articleChanges] of changesByArticle) {
    articleIndex++;
    console.log(`[${articleIndex}/${changesByArticle.size}] Artículo ${idArticulo}:`);

    await navigateToArticles(page);

    const opened = await openArticle(page, idArticulo);
    if (!opened) {
      for (const change of articleChanges) {
        results.push({
          idArticulo,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          attemptedValue: change.newValue,
          status: 'error',
          error: 'No se pudo abrir el artículo',
        });
      }
      continue;
    }

    // Agrupar por pestaña
    const changesByTab = new Map<string, Change[]>();
    for (const change of articleChanges) {
      const existing = changesByTab.get(change.tab) || [];
      existing.push(change);
      changesByTab.set(change.tab, existing);
    }

    // Aplicar por pestaña
    for (const [tabName, tabChanges] of changesByTab) {
      console.log(`   📑 ${tabName}`);

      const tabSelected = await selectTab(page, tabName);
      if (!tabSelected) {
        for (const change of tabChanges) {
          results.push({
            idArticulo,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
            attemptedValue: change.newValue,
            status: 'error',
            error: `Pestaña ${tabName} no encontrada`,
          });
        }
        continue;
      }
      await delay(1500);

      // Aplicar cada cambio
      for (const change of tabChanges) {
        const mapping = COLUMN_MAP[change.field];
        let success = false;
        let actualValue: any = undefined;
        let error: string | undefined = undefined;

        try {
          switch (change.fieldType) {
            case 'text':
              if (mapping?.selector) {
                success = await editTextField(page, mapping.selector, change.newValue);
              }
              break;

            case 'checkbox':
              if (mapping?.selector) {
                success = await editCheckbox(page, mapping.selector, change.newValue);
              }
              break;

            case 'textarea':
              if (mapping?.selector) {
                success = await editTextarea(page, mapping.selector, change.newValue);
              }
              break;

            case 'grid':
              if (change.gridConfig) {
                const numValue = parseFloat(change.newValue) || 0;
                const gridResult = await editGridCell(
                  page,
                  change.gridConfig.warehouse,
                  change.gridConfig.column,
                  numValue
                );
                success = gridResult.success;
                actualValue = gridResult.actualValue;
              }
              break;

            case 'dropdown':
              if (mapping?.selector) {
                // Familia y Subfamilia son cascadas que dependen de Sección
                const isCascade = change.field.toLowerCase().includes('familia');
                // Si es Sección, también usar click físico para que dispare la cascada
                const isSeccion = change.field.toLowerCase().includes('seccion');

                let dropdownResult;
                if (isSeccion) {
                  console.log(`         [DEBUG] Usando click físico para Sección (trigger cascade)`);
                  dropdownResult = await editDropdownWithClick(page, mapping.selector, change.newValue);
                } else {
                  dropdownResult = await editDropdown(page, mapping.selector, change.newValue, isCascade);
                }
                success = dropdownResult.success;
                if (!success && dropdownResult.error) {
                  error = dropdownResult.error;
                }
              }
              break;

            case 'tarifa':
              if (change.tarifaConfig) {
                const numValue = parseFloat(change.newValue) || 0;
                const tarifaResult = await editTarifaCell(
                  page,
                  change.tarifaConfig.tarifaName,
                  change.tarifaConfig.column,
                  numValue
                );
                success = tarifaResult.success;
                actualValue = tarifaResult.actualValue;
              }
              break;

            case 'numeric':
              if (mapping?.selector) {
                const numValue = parseFloat(change.newValue) || 0;
                success = await editNumericField(page, mapping.selector, numValue);
              }
              break;

            default:
              error = 'Tipo de campo no soportado';
          }
        } catch (e: any) {
          error = e.message;
        }

        const result: ChangeResult = {
          idArticulo,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          attemptedValue: change.newValue,
          actualValue,
          status: success ? 'success' : 'error',
          error: success ? undefined : (error || 'Error aplicando cambio'),
        };

        results.push(result);
        console.log(`      ${success ? '✓' : '✗'} ${change.field}: ${change.oldValue} → ${change.newValue}`);
      }
    }

    // Guardar
    const saved = await saveArticle(page);
    console.log(`   ${saved ? '💾 Guardado' : '⚠️ Error guardando'}`);

    // Cerrar
    await closeArticle(page);
    await delay(1000);
  }

  return results;
}

// =============================================================================
// Generar reporte detallado
// =============================================================================

function generateReport(
  excelFile: string,
  changes: Change[],
  results: ChangeResult[]
): ProcessReport {
  const report: ProcessReport = {
    timestamp: new Date().toISOString(),
    excelFile,
    totalChanges: changes.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    verifyFailed: results.filter(r => r.status === 'verify_failed').length,
    changes: results,
    summary: {
      byField: {},
      byArticle: {},
    },
  };

  // Resumen por campo
  for (const result of results) {
    // Inicializar si no existe
    if (!report.summary.byField[result.field]) {
      report.summary.byField[result.field] = { total: 0, success: 0, failed: 0 };
    }
    const fieldStats = report.summary.byField[result.field]!;
    fieldStats.total++;
    if (result.status === 'success') {
      fieldStats.success++;
    } else {
      fieldStats.failed++;
    }

    // Resumen por artículo
    if (!report.summary.byArticle[result.idArticulo]) {
      report.summary.byArticle[result.idArticulo] = { total: 0, success: 0, failed: 0 };
    }
    const articleStats = report.summary.byArticle[result.idArticulo]!;
    articleStats.total++;
    if (result.status === 'success') {
      articleStats.success++;
    } else {
      articleStats.failed++;
    }
  }

  return report;
}

function saveReport(report: ProcessReport, dataDir: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');

  // Guardar JSON
  const jsonPath = path.join(dataDir, `reporte-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Guardar MD legible
  const mdPath = path.join(dataDir, `reporte-${timestamp}.md`);
  let md = `# Reporte de Cambios QVET\n\n`;
  md += `**Fecha:** ${report.timestamp}\n`;
  md += `**Archivo:** ${report.excelFile}\n\n`;
  md += `## Resumen\n\n`;
  md += `| Métrica | Valor |\n|---------|-------|\n`;
  md += `| Total de cambios | ${report.totalChanges} |\n`;
  md += `| Exitosos | ${report.successful} |\n`;
  md += `| Fallidos | ${report.failed} |\n`;
  md += `| Omitidos | ${report.skipped} |\n\n`;

  md += `## Cambios por Campo\n\n`;
  md += `| Campo | Total | Éxito | Fallo |\n|-------|-------|-------|-------|\n`;
  for (const [field, stats] of Object.entries(report.summary.byField)) {
    md += `| ${field} | ${stats.total} | ${stats.success} | ${stats.failed} |\n`;
  }

  md += `\n## Detalle de Cambios\n\n`;
  for (const change of report.changes) {
    const status = change.status === 'success' ? '✅' : '❌';
    md += `- ${status} **Art. ${change.idArticulo}** - ${change.field}: \`${change.oldValue}\` → \`${change.newValue}\``;
    if (change.error) md += ` (Error: ${change.error})`;
    md += `\n`;
  }

  fs.writeFileSync(mdPath, md);

  return jsonPath;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || !args[0]) {
    console.log('❌ Uso: npx ts-node src/scripts/qvet-process-edit.ts <archivo.xlsx>');
    process.exit(1);
  }

  const excelPath: string = args[0];
  if (!fs.existsSync(excelPath)) {
    console.log(`❌ Archivo no encontrado: ${excelPath}`);
    process.exit(1);
  }

  console.log('🏥 QVET Process Edit v2');
  console.log('=======================\n');
  console.log(`📄 Archivo: ${excelPath}`);
  console.log(`👤 Usuario: ${QVET_USER}`);
  console.log(`🏢 Clínica: ${QVET_AUTO}\n`);

  if (!QVET_USER || !QVET_PASS || !QVET_AUTO) {
    console.log('❌ Faltan credenciales en .env');
    process.exit(1);
  }

  // Leer Excel
  console.log('📊 Leyendo Excel...');
  const { original, editar } = readExcelSheets(excelPath);
  console.log(`   📋 Hoja Original: ${original.length - 1} filas`);
  console.log(`   📝 Hoja Editar: ${editar.length - 1} filas`);

  // Detectar cambios
  console.log('\n🔍 Detectando cambios...');
  const changes = detectChanges(original, editar);

  if (changes.length === 0) {
    console.log('   ℹ️  No se detectaron cambios');
    process.exit(0);
  }

  console.log(`   ✅ ${changes.length} cambios detectados:`);
  const uniqueArticles = new Set(changes.map(c => c.idArticulo));
  console.log(`      - ${uniqueArticles.size} artículos afectados`);

  // Resumen por campo
  const changesByField = new Map<string, number>();
  for (const change of changes) {
    changesByField.set(change.field, (changesByField.get(change.field) || 0) + 1);
  }
  for (const [field, count] of changesByField) {
    console.log(`      - ${field}: ${count}`);
  }

  // Ejecutar
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
      defaultViewport: null,
    });

    const page = await browser.newPage();

    const loginOk = await loginQVET(page);
    if (!loginOk) {
      throw new Error('Login falló');
    }

    const results = await applyChanges(page, changes);

    // Generar reporte
    const dataDir = path.join(process.cwd(), 'data', 'qvet');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const report = generateReport(excelPath, changes, results);
    const reportPath = saveReport(report, dataDir);

    // Resumen final
    console.log('\n========================================');
    console.log('📊 RESUMEN FINAL');
    console.log('========================================');
    console.log(`✅ Exitosos: ${report.successful}`);
    console.log(`❌ Fallidos: ${report.failed}`);
    console.log(`⏭️  Omitidos: ${report.skipped}`);
    console.log(`\n📄 Reportes guardados en:`);
    console.log(`   - ${reportPath}`);
    console.log(`   - ${reportPath.replace('.json', '.md')}`);

    console.log('\n⏳ Cerrando en 5 segundos...');
    await delay(5000);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
