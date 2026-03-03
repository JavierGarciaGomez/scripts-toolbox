/**
 * QVET Shared Types
 *
 * Types used across all QVET article editing modules.
 */

import { Page } from 'puppeteer';

// Field types supported by the editor
export type FieldType = 'text' | 'checkbox' | 'dropdown' | 'grid' | 'textarea' | 'tarifa' | 'numeric';

// Configuration for a single field mapping (Excel column → QVET field)
export interface FieldConfig {
  field: string;
  tab: string;
  type: FieldType;
  selector?: string;
  gridConfig?: { warehouse: string; column: string };
  tarifaConfig?: { tarifaName: string; column: string };
}

// A single field update intent (what we want to change)
export interface FieldUpdate {
  field: string;        // Excel column header
  newValue: string;     // Value from Excel
  tab: string;
  fieldType: FieldType;
  selector?: string | undefined;
  gridConfig?: { warehouse: string; column: string } | undefined;
  tarifaConfig?: { tarifaName: string; column: string } | undefined;
}

// An article with all its intended updates
export interface UpdateIntent {
  idArticulo: number;
  updates: FieldUpdate[];
}

// Result of applying a single field update
export interface UpdateResult {
  idArticulo: number;
  field: string;
  previousValue: string;  // Value captured from QVET before edit
  newValue: string;        // Value from Excel
  status: 'applied' | 'skipped_same' | 'error' | 'dry_run';
  error?: string | undefined;
}

// Full report of an update run
export interface UpdateReport {
  timestamp: string;
  excelFile: string;
  options: { force: boolean; dryRun: boolean; limit: number };
  totalIntents: number;
  totalFields: number;
  applied: number;
  skippedSame: number;
  failed: number;
  dryRun: number;
  results: UpdateResult[];
  summary: {
    byField: Record<string, { total: number; applied: number; skipped: number; failed: number }>;
    byArticle: Record<number, { total: number; applied: number; skipped: number; failed: number }>;
  };
}

// Logger interface used across modules
export interface Logger {
  (msg: string): void;
}
