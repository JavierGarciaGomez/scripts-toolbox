# Instrucciones para Claude - QVET Scripts

## Contexto del Proyecto QVET

QVET es un sistema de gestión veterinaria (ASP.NET MVC con Kendo UI). Este proyecto contiene scripts para automatizar tareas en QVET.

### Credenciales
Las credenciales están en `.env`:
- `QVET_USER` - Usuario
- `QVET_PASS` - Contraseña
- `QVET_AUTO` - Código de clínica

### URLs
- Login: `https://go.qvet.net/`
- Después del login puede redirigir a AutoLogin para seleccionar sucursal
- La URL del servidor cambia (ej: `v116r25-20250424-mx-02.qvet.net`)

---

## Scripts QVET Existentes

### `qvet-edit-stock.ts`
Edita Stock Mínimo y Stock Óptimo de artículos en la pestaña Almacenes.

**Uso:**
```bash
npx ts-node src/scripts/qvet-edit-stock.ts
```

**Configuración** (hardcodeada en el archivo):
```typescript
const idArticulo = 6242;
const almacenes = ['urban', 'harbor', 'montejo'];
const stockMin = 1;
const stockOptimo = 6;
```

**Funcionamiento:**
1. Login con Puppeteer (headless: false)
2. Navega a Artículos
3. Busca artículo por ID
4. Doble click para abrir modal
5. Usa Kendo TabStrip API para ir a pestaña "Almacenes"
6. Doble click en celdas del grid para editar valores
7. Click en botón `button.guardar`
8. Navega a Home para liberar bloqueo del artículo

**Selectores importantes:**
- Pestaña Almacenes: `tabStrip.select(index)` donde el tab contiene "Almacenes"
- Grid Almacenes: `[id*="GridAlmacenes"]`
- Celdas visibles del grid: índice 4 = Stock Mínimo, índice 5 = Stock Óptimo
- Botón guardar: `button.guardar` o `[id$="_guardar"]`

### `qvet-batch-edit.ts`
Agrega texto "SCL" al campo Referencia de múltiples artículos.

**Uso:**
```bash
npx ts-node src/scripts/qvet-batch-edit.ts
```

**Configuración:**
```typescript
const ARTICLE_IDS = [3406, 5666, ...]; // Lista de IDs
const TEXT_TO_ADD = 'SCL';
```

---

## Editor Masivo de Artículos (IMPLEMENTADO)

Sistema para editar múltiples campos de múltiples artículos usando Excel como interfaz.

### Flujo de trabajo

```bash
# 1. Preparar Excel con datos actuales
npx ts-node src/scripts/qvet-prepare-edit.ts

# 2. Usuario edita data/qvet/articulos-TIMESTAMP.xlsx (Hoja "Editar")

# 3. Procesar cambios
npx ts-node src/scripts/qvet-process-edit.ts data/qvet/articulos-TIMESTAMP.xlsx
```

### Scripts del Editor Masivo

#### `qvet-capture-fields.ts`
Captura el HTML de cada pestaña del modal de artículos para documentar campos editables.

**Uso:**
```bash
npx ts-node src/scripts/qvet-capture-fields.ts
```

**Output:** `tmp/qvet-tabs/*.html` - HTML de cada pestaña

#### `qvet-field-map.ts`
Mapa de campos editables con selectores CSS y tipos de input.

**Contenido:**
- `DATOS_GENERALES_FIELDS` - Campos de la pestaña Datos generales
- `ALMACENES_GRID` - Estructura del grid de almacenes (columnas 4=StockMinimo, 5=StockMaximo)
- `OBSERVACIONES_FIELDS` - Campo de observaciones
- `TAB_INDEX` - Índice de pestañas

**Uso en código:**
```typescript
import { ALMACENES_GRID, getRealSelector } from './qvet-field-map';
// ALMACENES_GRID.columns.StockMinimo.index = 4
// ALMACENES_GRID.columns.StockMaximo.index = 5
```

#### `qvet-prepare-edit.ts`
Descarga el Listado de Conceptos y genera Excel para edición.

**Uso:**
```bash
npx ts-node src/scripts/qvet-prepare-edit.ts [--activo=S]
```

**Output:** `data/qvet/articulos-TIMESTAMP.xlsx` con:
- Hoja "Original": datos actuales (baseline)
- Hoja "Editar": copia + columnas adicionales:
  - `Stock_Min_Harbor`, `Stock_Opt_Harbor`
  - `Stock_Min_Montejo`, `Stock_Opt_Montejo`
  - `Stock_Min_Urban`, `Stock_Opt_Urban`
  - `Observaciones`

#### `qvet-process-edit.ts`
Lee Excel, detecta cambios y los aplica en QVET.

**Uso:**
```bash
npx ts-node src/scripts/qvet-process-edit.ts data/qvet/articulos-TIMESTAMP.xlsx
```

**Funcionamiento:**
1. Compara hoja "Original" vs "Editar"
2. Detecta cambios por celda
3. Agrupa cambios por artículo y pestaña
4. Para cada artículo:
   - Abre el artículo en QVET
   - Navega a cada pestaña con cambios
   - Aplica los cambios (grid, input, textarea)
   - Guarda
5. Genera reporte JSON en `data/qvet/reporte-TIMESTAMP.json`

**Campos soportados:**
- Grid Almacenes: Stock Mínimo, Stock Óptimo (por almacén)
- Observaciones (textarea)
- Referencia, Descripcion1, Descripcion2 (input text)

---

## Patrones técnicos aprendidos

### Login en QVET
```typescript
// 1. Ir a go.qvet.net
// 2. Llenar #Clinica, #UserName, #Password
// 3. Click #btnLogin
// 4. Si URL contiene "AutoLogin", seleccionar sucursal en dropdown
// 5. Verificar login por selector .navbar o URL /Home
```

### Cambiar pestaña con Kendo TabStrip
```typescript
await page.evaluate(() => {
  const $ = (window as any).jQuery;
  const tabStrips = $('[data-role="tabstrip"]');
  for (let i = 0; i < tabStrips.length; i++) {
    const tabStrip = $(tabStrips[i]).data('kendoTabStrip');
    if (!tabStrip) continue;
    const items = tabStrip.tabGroup.children('li');
    for (let j = 0; j < items.length; j++) {
      if ($(items[j]).text().includes('NombrePestaña')) {
        tabStrip.select(j);
        return;
      }
    }
  }
});
```

### Editar celda de Kendo Grid
```typescript
// 1. Obtener coordenadas de la celda
const coords = await page.evaluate((rowIndex, cellIndex) => {
  const grid = $('[id*="GridName"]');
  const rows = grid.find('tbody tr.k-master-row');
  const cells = rows.eq(rowIndex).find('td:visible');
  const rect = cells.eq(cellIndex)[0].getBoundingClientRect();
  return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
}, rowIndex, cellIndex);

// 2. Doble click para editar
await page.mouse.click(coords.x, coords.y, { clickCount: 2 });
await delay(500);

// 3. Seleccionar todo y escribir nuevo valor
await page.keyboard.down('Control');
await page.keyboard.press('a');
await page.keyboard.up('Control');
await page.keyboard.type(String(nuevoValor));
await page.keyboard.press('Tab');
```

### Liberar artículo después de editar
```typescript
// Navegar a Home para liberar el bloqueo del artículo
await page.goto('https://go.qvet.net/Home/Index', { waitUntil: 'networkidle2' });
```

---

## Archivos importantes

```
src/scripts/
├── qvet-edit-stock.ts      # Editar stock en almacenes (artículo único)
├── qvet-batch-edit.ts      # Agregar SCL a Referencia
├── qvet-api.ts             # API de descarga de reportes
├── qvet-capture-fields.ts  # Capturar HTML de pestañas
├── qvet-field-map.ts       # Mapa de selectores de campos
├── qvet-prepare-edit.ts    # Generar Excel para edición masiva
└── qvet-process-edit.ts    # Procesar cambios del Excel

data/qvet/                   # Datos de entrada/salida
├── articulos-*.xlsx        # Excel para edición masiva
├── reporte-*.json          # Reportes de cambios aplicados
└── reports/                # Reportes descargados

tmp/qvet-tabs/              # HTML capturado de pestañas del artículo
```
