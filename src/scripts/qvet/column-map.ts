/**
 * QVET Column Map
 *
 * Maps Excel column headers to QVET field configurations.
 * Also defines grid column indices for the Almacenes grid.
 */

import { FieldConfig } from './types';

// Mapeo completo de columnas Excel a campos QVET
export const COLUMN_MAP: Record<string, FieldConfig> = {
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

// Visible column indices in the Almacenes Kendo Grid
// Columns: expand(0), NombreAlmacen(1), CompraMin(2), CompraMin2(3), StockMinimo(4), StockMaximo(5), StockTotal(6)
export const GRID_COLUMN_INDEX: Record<string, number> = {
  'StockMinimo': 4,
  'StockMaximo': 5,
  'CompraMinima': 2,
};
