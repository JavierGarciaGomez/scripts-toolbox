# Plan: QVET Editor Masivo de Artículos

## Objetivo
Crear un sistema de dos scripts que permita editar múltiples campos de múltiples artículos en QVET de forma masiva usando Excel como interfaz de usuario.

---

## Fase 0: Detección y Documentación de Campos

**Objetivo**: Identificar y documentar todos los campos editables en cada pestaña del artículo.

### Paso 0.1: Capturar HTML de cada pestaña
- Crear script `qvet-capture-fields.ts`
- Abrir un artículo de ejemplo (ej: 6242)
- Navegar a cada pestaña y guardar el HTML en `tmp/qvet-tabs/`
  - `datos-generales.html`
  - `precios-ventas.html`
  - `almacenes.html`
  - `observaciones.html`

### Paso 0.2: Analizar HTML y documentar selectores

### Pestañas y Campos a Documentar:

#### Pestaña: Datos Generales (default)
- [ ] Descripción 1 - tipo input, selector, nombre del campo
- [ ] Descripción 2
- [ ] Sección (dropdown?)
- [ ] Familia (dropdown?)
- [ ] Subfamilia (dropdown?)
- [ ] Marca (dropdown?)
- [ ] Activo (checkbox?)
- [ ] Visibilidad compras (checkbox?)
- [ ] Visibilidad ventas (checkbox?)
- [ ] Solo escandallo (checkbox?)

#### Pestaña: Precio compras / ventas
- [ ] P. Mínimo
- [ ] UPC BI
- [ ] Imp. Ventas (dropdown?)
- [ ] Imp. Compras (dropdown?)
- [ ] Tabla de tarifas - Tarifa Ordinaria:
  - [ ] PVP
  - [ ] BI
  - [ ] Margen C.
  - [ ] Margen V.

#### Pestaña: Almacenes
- [ ] Grid con almacenes (Harbor, Montejo, Urban Center)
- [ ] Por cada almacén:
  - [ ] Compra Mínima
  - [ ] Stock Mínimo
  - [ ] Stock Óptimo

#### Pestaña: Observaciones
- [ ] Observaciones (textarea)

### Entregable Fase 0:
- Documento con selectores CSS/IDs de cada campo
- Tipo de input (text, number, dropdown, checkbox, grid cell)
- Nombre del campo en el formulario HTML

---

## Fase 1: Script de Preparación (`qvet-prepare-edit.ts`)

**Objetivo**: Generar un Excel con los datos actuales de los artículos para que el usuario los edite.

### Funcionalidad:
1. Login a QVET via API (obtener cookie de sesión)
2. Llamar API `POST /Listados/ExportarListado` con:
   - IdListado: "25" (Listado de Conceptos)
   - Parámetros de filtro (Activo=S, etc.)
3. Procesar respuesta JSON
4. Crear Excel con 2 hojas:
   - **Hoja 1 "Original"**: Datos tal cual están en QVET (baseline)
   - **Hoja 2 "Editar"**: Copia de Hoja 1 + columnas adicionales:
     - Todas las columnas de Listado de Conceptos
     - Columnas extra para campos de otras pestañas (Stock Mínimo, Stock Óptimo, etc.)
5. Guardar como `data/qvet/articulos-TIMESTAMP.xlsx`

### Columnas adicionales en Hoja "Editar":
(Se determinarán al descargar el reporte y comparar con campos de Fase 0)

Campos candidatos a agregar:
- Stock_Minimo_Urban, Stock_Optimo_Urban
- Stock_Minimo_Harbor, Stock_Optimo_Harbor
- Stock_Minimo_Montejo, Stock_Optimo_Montejo
- Observaciones
- Referencia (si no está)
- Otros campos de pestañas que no estén en el listado base

---

## Fase 2: Edición Manual por Usuario

El usuario abre el Excel y modifica los valores en la Hoja "Editar".

---

## Fase 3: Script de Procesamiento (`qvet-process-edit.ts`)

**Objetivo**: Detectar cambios y aplicarlos en QVET.

### Funcionalidad:
1. Leer Excel (ambas hojas)
2. Comparar Hoja "Original" vs Hoja "Editar" fila por fila
3. Generar lista de cambios: `{ idArticulo, campo, valorAnterior, valorNuevo }`
4. Para cada artículo con cambios:
   - Abrir artículo en QVET
   - Navegar a la pestaña correspondiente
   - Aplicar cambios usando los selectores documentados
   - Guardar
   - Registrar éxito/fallo
5. Generar reporte:
   - `data/qvet/reporte-TIMESTAMP.json` con resultados
   - Lista de fallos para reintentar
6. Si hay fallos, reintentar automáticamente (con límite de intentos)

### Estructura del reporte:
```json
{
  "timestamp": "2024-01-08T...",
  "total": 50,
  "exitosos": 48,
  "fallidos": 2,
  "cambios": [
    { "idArticulo": 6242, "campo": "StockMinimo_Urban", "anterior": 0, "nuevo": 1, "estado": "ok" },
    { "idArticulo": 6243, "campo": "Referencia", "anterior": "", "nuevo": "SCL", "estado": "error", "error": "Artículo bloqueado" }
  ]
}
```

---

## Archivos a Crear/Modificar

1. `src/scripts/qvet-prepare-edit.ts` - Script de preparación
2. `src/scripts/qvet-process-edit.ts` - Script de procesamiento
3. `src/scripts/qvet-field-map.ts` - Mapa de campos con selectores y tipos
4. Actualizar `CLAUDE.md` con documentación de los nuevos scripts

---

## Verificación

1. Ejecutar `qvet-prepare-edit.ts` y verificar que genera Excel correcto
2. Modificar algunos valores en la Hoja "Editar"
3. Ejecutar `qvet-process-edit.ts` y verificar:
   - Detecta solo los cambios realizados
   - Aplica cambios correctamente en QVET
   - Genera reporte preciso
4. Probar con artículo bloqueado para verificar manejo de errores y reintentos

---

## Notas Técnicas

- Reusar funciones de login/navegación de scripts existentes (`qvet-edit-stock.ts`)
- Usar `xlsx` para manejo de Excel
- Usar Puppeteer con `headless: false` para debugging inicial
- Implementar delays adecuados para evitar bloqueos de QVET
- Login API para obtener sesión, Puppeteer para editar campos

---

## Orden de Implementación

1. **`qvet-capture-fields.ts`** - Capturar HTML de pestañas (Fase 0)
2. Analizar HTML y crear **`qvet-field-map.ts`** con selectores
3. **`qvet-prepare-edit.ts`** - Descargar listado y generar Excel (Fase 1)
4. **`qvet-process-edit.ts`** - Procesar cambios del Excel (Fase 3)
5. Pruebas end-to-end
6. Documentación en CLAUDE.md

---

## Uso Final

```bash
# 1. Preparar Excel con datos actuales
npx ts-node src/scripts/qvet-prepare-edit.ts

# 2. Usuario edita data/qvet/articulos-TIMESTAMP.xlsx

# 3. Procesar cambios
npx ts-node src/scripts/qvet-process-edit.ts data/qvet/articulos-TIMESTAMP.xlsx
```
