/**
 * QVET Field Map
 *
 * Mapa de campos editables en el formulario de artículos de QVET.
 * Los selectores usan un patrón con prefijo dinámico: {prefix}_{fieldName}
 * El prefijo es generado por QVET y se obtiene del atributo data del formulario.
 *
 * Documentado: 2026-01-08
 * Artículo de referencia: 6242
 */

export type FieldType = 'text' | 'number' | 'dropdown' | 'checkbox' | 'textarea' | 'grid';

export interface FieldDefinition {
  name: string;           // Nombre interno del campo
  label: string;          // Etiqueta visible en QVET
  type: FieldType;        // Tipo de input
  selector: string;       // Selector CSS (usa {prefix} como placeholder)
  tab: string;            // Pestaña donde se encuentra
  gridColumn?: number;    // Índice de columna (solo para campos de grid)
  notes?: string;         // Notas adicionales
}

// Prefijo dinámico: se obtiene del atributo id del contenedor .ViewWrapper
// Ejemplo: "3362834c1a2dd9d138e6b2c7abe8eaba"
export const FORM_PREFIX_SELECTOR = '.ViewWrapper';

/**
 * Obtiene el prefijo del formulario de la página actual
 */
export function getFormPrefix(document: Document): string {
  const wrapper = document.querySelector('.ViewWrapper');
  return wrapper?.id || '';
}

// =============================================================================
// PESTAÑA: Datos Generales
// =============================================================================
export const DATOS_GENERALES_FIELDS: FieldDefinition[] = [
  {
    name: 'Descripcio1',
    label: 'Descripción 1',
    type: 'text',
    selector: '#{prefix}_Descripcio1',
    tab: 'Datos generales',
  },
  {
    name: 'Descripcio2',
    label: 'Descripción 2',
    type: 'text',
    selector: '#{prefix}_Descripcio2',
    tab: 'Datos generales',
  },
  {
    name: 'Seccio.Id',
    label: 'Sección',
    type: 'dropdown',
    selector: '#{prefix}_Seccio_Id',
    tab: 'Datos generales',
    notes: 'Dropdown con source de /Helper/GetSecciones',
  },
  {
    name: 'IdFamilia',
    label: 'Familia',
    type: 'dropdown',
    selector: '#{prefix}_IdFamilia',
    tab: 'Datos generales',
    notes: 'Cascada de Sección, source: /Helper/GetFamilias',
  },
  {
    name: 'IdSubfamilia',
    label: 'Subfamilia',
    type: 'dropdown',
    selector: '#{prefix}_IdSubfamilia',
    tab: 'Datos generales',
    notes: 'Cascada de Familia, source: /Helper/GetSubfamilias',
  },
  {
    name: 'IdMarca',
    label: 'Marca',
    type: 'dropdown',
    selector: '#IdMarca',
    tab: 'Datos generales',
    notes: 'Sin prefijo dinámico',
  },
  {
    name: 'Referencia',
    label: 'Referencia',
    type: 'text',
    selector: '#{prefix}_Referencia',
    tab: 'Datos generales',
  },
  {
    name: 'CodiBarres',
    label: 'Código de barras compra',
    type: 'text',
    selector: '#{prefix}_CodiBarres',
    tab: 'Datos generales',
  },
  {
    name: 'CodigoAlternativo',
    label: 'Código alternativo',
    type: 'text',
    selector: '#{prefix}_CodigoAlternativo',
    tab: 'Datos generales',
  },
  {
    name: 'PesoEnvase',
    label: 'Tamaño envase',
    type: 'number',
    selector: '#{prefix}_PesoEnvase',
    tab: 'Datos generales',
    notes: 'Kendo NumericTextBox',
  },
  {
    name: 'IdUnidadMedida',
    label: 'Formato envase',
    type: 'dropdown',
    selector: '#{prefix}_IdUnidadMedida',
    tab: 'Datos generales',
  },
  {
    name: 'Tipus.Id',
    label: 'Tipo',
    type: 'dropdown',
    selector: '#{prefix}_Tipus_Id',
    tab: 'Datos generales',
    notes: 'Valores: Normal, Medicament, Quota, Servicio, Cargo, Habitacion, etc.',
  },
  {
    name: 'IdTipoProcedimiento',
    label: 'Tipo procedimiento',
    type: 'dropdown',
    selector: '#{prefix}_IdTipoProcedimiento',
    tab: 'Datos generales',
    notes: 'Valores: Terapéutico, Diagnóstico, Preventivo, Otros',
  },
  {
    name: 'TipusEscandallArticle',
    label: 'Escandallos',
    type: 'dropdown',
    selector: '#{prefix}_TipusEscandallArticle',
    tab: 'Datos generales',
    notes: 'Valores: 0=Simple, 1=Por componentes, 3=Asociado',
  },
  {
    name: 'ControlEstocsArticle',
    label: 'Stocks',
    type: 'dropdown',
    selector: '#{prefix}_ControlEstocsArticle',
    tab: 'Datos generales',
    notes: 'Valores: SenseControl, ControlEstocsSenseLots, ControlEstocsAmbLots',
  },
  {
    name: 'TipusFacturacio',
    label: 'Tipo facturación',
    type: 'dropdown',
    selector: '#{prefix}_TipusFacturacio',
    tab: 'Datos generales',
    notes: 'Valores: Diferida, Immediata',
  },
  {
    name: 'IdConceptosCategoria',
    label: 'Concepto categoría',
    type: 'dropdown',
    selector: '#IdConceptosCategoria',
    tab: 'Datos generales',
    notes: 'Sin prefijo dinámico',
  },
  // Checkboxes
  {
    name: 'Actiu',
    label: 'Activo',
    type: 'checkbox',
    selector: '#{prefix}_Actiu',
    tab: 'Datos generales',
    notes: 'Hidden value en #{prefix}_Actiu_hidden',
  },
  {
    name: 'ArticleCompra',
    label: 'Visibilidad compras',
    type: 'checkbox',
    selector: '#{prefix}_ArticleCompra',
    tab: 'Datos generales',
    notes: 'Hidden value en #{prefix}_ArticleCompra_hidden',
  },
  {
    name: 'ArticleVenta',
    label: 'Visibilidad ventas',
    type: 'checkbox',
    selector: '#{prefix}_ArticleVenta',
    tab: 'Datos generales',
    notes: 'Hidden value en #{prefix}_ArticleVenta_hidden',
  },
  {
    name: 'ArticleVentaSoloEnEscandallo',
    label: 'Solo escandallo',
    type: 'checkbox',
    selector: '#{prefix}_ArticleVentaSoloEnEscandallo',
    tab: 'Datos generales',
    notes: 'Hidden value en #{prefix}_ArticleVentaSoloEnEscandallo_hidden',
  },
  {
    name: 'SoloParaControlEstoc',
    label: 'Sin cargo hospi',
    type: 'checkbox',
    selector: '#{prefix}_SoloParaControlEstoc',
    tab: 'Datos generales',
    notes: 'Hidden value en #{prefix}_SoloParaControlEstoc_hidden',
  },
  {
    name: 'NoAplicarFidelizacion',
    label: 'No aplicar fidelización',
    type: 'checkbox',
    selector: '#{prefix}_NoAplicarFidelizacion',
    tab: 'Datos generales',
    notes: 'Hidden value en #{prefix}_NoAplicarFidelizacion_hidden',
  },
];

// =============================================================================
// PESTAÑA: Precios compras / ventas
// =============================================================================
export const PRECIOS_FIELDS: FieldDefinition[] = [
  // Los precios están en un grid de tarifas, no son campos simples
  // La estructura es más compleja con múltiples tarifas
];

// Grid de Tarifas - Columnas
export const GRID_TARIFAS_COLUMNS = {
  gridSelector: '[id*="GridTarifes"]',
  columns: {
    NomTarifa: { index: 0, label: 'Tarifa', editable: false },
    PVP_BI: { index: 1, label: 'PVP BI', editable: true },
    PreuUnitari: { index: 2, label: 'PVP', editable: true },
    MargenCompras: { index: 3, label: 'Margen C.', editable: true },
    MargenVentas: { index: 4, label: 'Margen V.', editable: true },
  },
};

// =============================================================================
// PESTAÑA: Almacenes
// =============================================================================
export const ALMACENES_GRID = {
  gridSelector: '[id*="GridAlmacenes"]',
  tab: 'Almacenes',
  columns: {
    IdAlmacen: { index: 0, label: 'IdAlmacen', editable: false, visible: false },
    NombreAlmacen: { index: 1, label: 'Almacén', editable: false, visible: true },
    CompraMinima: { index: 2, label: 'Compra Mínima', editable: true, visible: true },
    CompraMinima2: { index: 3, label: 'Compra Mínima (2)', editable: true, visible: true },
    StockMinimo: { index: 4, label: 'Stock Mínimo', editable: true, visible: true },
    StockMaximo: { index: 5, label: 'Stock Óptimo', editable: true, visible: true },
    StockTotal: { index: 6, label: 'Stock Total', editable: false, visible: true },
  },
  // Almacenes conocidos (pueden variar por clínica)
  warehouses: ['HARBOR', 'MONTEJO', 'URBAN CENTER'],
};

// =============================================================================
// PESTAÑA: Observaciones
// =============================================================================
export const OBSERVACIONES_FIELDS: FieldDefinition[] = [
  {
    name: 'Observacions',
    label: 'Observaciones',
    type: 'textarea',
    selector: '#Observacions',
    tab: 'Observaciones',
    notes: 'Textarea sin prefijo dinámico',
  },
];

// =============================================================================
// ÍNDICE DE PESTAÑAS
// =============================================================================
export const TAB_INDEX = {
  'Datos generales': 0,
  'Precios compras / ventas': 1,
  'Promociones': 2,
  'Compras': 3,
  'Almacenes': 4,
  'Escandallos': 5,
  'Medicamento': 6,
  'Posologia': 7,
  'Observaciones': 8,
  'Coberturas': 9,
  'Serie de facturación': 10,
  'Centros': 11,
  'Historia clínica': 12,
  'Zonas anatómicas': 13,
  'Gama': 14,
};

// =============================================================================
// HELPER: Obtener selector real sustituyendo prefix
// =============================================================================
export function getRealSelector(selectorTemplate: string, prefix: string): string {
  return selectorTemplate.replace('{prefix}', prefix);
}

// =============================================================================
// TODOS LOS CAMPOS AGRUPADOS
// =============================================================================
export const ALL_FIELDS: FieldDefinition[] = [
  ...DATOS_GENERALES_FIELDS,
  ...PRECIOS_FIELDS,
  ...OBSERVACIONES_FIELDS,
];

// =============================================================================
// MAPA RÁPIDO POR NOMBRE
// =============================================================================
export const FIELD_BY_NAME: Record<string, FieldDefinition> = {};
ALL_FIELDS.forEach(field => {
  FIELD_BY_NAME[field.name] = field;
});

// =============================================================================
// BOTÓN GUARDAR
// =============================================================================
export const SAVE_BUTTON_SELECTORS = [
  'button.guardar',
  '[id$="_guardar"]',
  '.fa-floppy-disk',
];

// =============================================================================
// SELECTOR DEL TABSTRIP
// =============================================================================
export const TABSTRIP_SELECTOR = '[data-role="tabstrip"]';
