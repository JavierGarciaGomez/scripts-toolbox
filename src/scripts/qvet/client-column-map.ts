/**
 * QVET Client Column Map
 *
 * Maps Excel column headers to QVET client field configurations.
 * Based on captured fields from the client form.
 */

import { FieldConfig } from './types';

// Mapeo de columnas Excel a campos QVET de clientes
export const CLIENT_COLUMN_MAP: Record<string, FieldConfig> = {
  // ==========================================================================
  // PESTAÑA: Cliente - Datos principales
  // ==========================================================================
  'NOMBRE': { field: 'Nom', tab: 'Cliente', type: 'text', selector: '[id$="_Nom"]' },
  'Nombre': { field: 'Nom', tab: 'Cliente', type: 'text', selector: '[id$="_Nom"]' },
  'Nom': { field: 'Nom', tab: 'Cliente', type: 'text', selector: '[id$="_Nom"]' },

  'APELLIDO1': { field: 'Cognom1', tab: 'Cliente', type: 'text', selector: '[id$="_Cognom1"]' },
  'Apellido1': { field: 'Cognom1', tab: 'Cliente', type: 'text', selector: '[id$="_Cognom1"]' },
  'Apellido_1': { field: 'Cognom1', tab: 'Cliente', type: 'text', selector: '[id$="_Cognom1"]' },

  'APELLIDO2': { field: 'Cognom2', tab: 'Cliente', type: 'text', selector: '[id$="_Cognom2"]' },
  'Apellido2': { field: 'Cognom2', tab: 'Cliente', type: 'text', selector: '[id$="_Cognom2"]' },
  'Apellido_2': { field: 'Cognom2', tab: 'Cliente', type: 'text', selector: '[id$="_Cognom2"]' },

  'NIF': { field: 'NIF', tab: 'Cliente', type: 'text', selector: '[id$="_NIF"]' },
  'DNI': { field: 'NIF', tab: 'Cliente', type: 'text', selector: '[id$="_NIF"]' },
  'Documento': { field: 'NIF', tab: 'Cliente', type: 'text', selector: '[id$="_NIF"]' },

  'DOMICILIO': { field: 'Adreca1', tab: 'Cliente', type: 'text', selector: '[id$="_Adreca1"]' },
  'Domicilio': { field: 'Adreca1', tab: 'Cliente', type: 'text', selector: '[id$="_Adreca1"]' },
  'DIRECCIÓN': { field: 'Adreca1', tab: 'Cliente', type: 'text', selector: '[id$="_Adreca1"]' },
  'Direccion': { field: 'Adreca1', tab: 'Cliente', type: 'text', selector: '[id$="_Adreca1"]' },

  'CP': { field: 'CP', tab: 'Cliente', type: 'text', selector: '[id$="_CP"]' },
  'CÓDIGO POSTAL': { field: 'CP', tab: 'Cliente', type: 'text', selector: '[id$="_CP"]' },
  'Codigo_Postal': { field: 'CP', tab: 'Cliente', type: 'text', selector: '[id$="_CP"]' },

  'TELEFONO1': { field: 'Telefon1', tab: 'Cliente', type: 'text', selector: '[id$="_Telefon1"]' },
  'Telefono1': { field: 'Telefon1', tab: 'Cliente', type: 'text', selector: '[id$="_Telefon1"]' },
  'Telefono_1': { field: 'Telefon1', tab: 'Cliente', type: 'text', selector: '[id$="_Telefon1"]' },

  'TELEFONO2': { field: 'Telefon2', tab: 'Cliente', type: 'text', selector: '[id$="_Telefon2"]' },
  'Telefono2': { field: 'Telefon2', tab: 'Cliente', type: 'text', selector: '[id$="_Telefon2"]' },
  'Telefono_2': { field: 'Telefon2', tab: 'Cliente', type: 'text', selector: '[id$="_Telefon2"]' },

  'TELEFONO3': { field: 'Fax', tab: 'Cliente', type: 'text', selector: '[id$="_Fax"]' },
  'Telefono3': { field: 'Fax', tab: 'Cliente', type: 'text', selector: '[id$="_Fax"]' },
  'Telefono_3': { field: 'Fax', tab: 'Cliente', type: 'text', selector: '[id$="_Fax"]' },
  'TELÉFONO SMS': { field: 'Fax', tab: 'Cliente', type: 'text', selector: '[id$="_Fax"]' },

  'MOVIL': { field: 'TelefonoSMS', tab: 'Cliente', type: 'text', selector: '[id$="_TelefonoSMS"]' },
  'Movil': { field: 'TelefonoSMS', tab: 'Cliente', type: 'text', selector: '[id$="_TelefonoSMS"]' },
  'Numero_Movil': { field: 'TelefonoSMS', tab: 'Cliente', type: 'text', selector: '[id$="_TelefonoSMS"]' },

  'EMAIL': { field: 'Email', tab: 'Cliente', type: 'text', selector: '[id$="_Email"]' },
  'Email': { field: 'Email', tab: 'Cliente', type: 'text', selector: '[id$="_Email"]' },

  'PAIS_SMS': { field: 'IdPaisSMS', tab: 'Cliente', type: 'dropdown', selector: '[id$="_IdPaisSMS"]' },
  'Pais_SMS': { field: 'IdPaisSMS', tab: 'Cliente', type: 'dropdown', selector: '[id$="_IdPaisSMS"]' },

  'ACTIVO': { field: 'Actiu', tab: 'Cliente', type: 'checkbox', selector: '[id$="_Actiu"]' },
  'Activo': { field: 'Actiu', tab: 'Cliente', type: 'checkbox', selector: '[id$="_Actiu"]' },

  // ==========================================================================
  // PESTAÑA: Otros datos generales
  // ==========================================================================
  'CODIGO ALTERNATIVO': { field: 'CodigoAlternativo', tab: 'Otros datos generales', type: 'text', selector: '[id$="_CodigoAlternativo"]' },
  'Codigo_Alternativo': { field: 'CodigoAlternativo', tab: 'Otros datos generales', type: 'text', selector: '[id$="_CodigoAlternativo"]' },

  'WEB': { field: 'Web', tab: 'Otros datos generales', type: 'text', selector: '[id$="_Web"]' },
  'Web': { field: 'Web', tab: 'Otros datos generales', type: 'text', selector: '[id$="_Web"]' },

  // ==========================================================================
  // PESTAÑA: Observaciones
  // ==========================================================================
  'OBSERVACIONES': { field: 'Observacions', tab: 'Observaciones', type: 'textarea', selector: '#Observacions' },
  'Observaciones': { field: 'Observacions', tab: 'Observaciones', type: 'textarea', selector: '#Observacions' },

  'AVISOS': { field: 'Avisos', tab: 'Observaciones', type: 'textarea', selector: '#Avisos' },
  'Avisos': { field: 'Avisos', tab: 'Observaciones', type: 'textarea', selector: '#Avisos' },
};
