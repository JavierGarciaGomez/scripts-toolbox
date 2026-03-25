/**
 * client.ts — Cliente HTTP para la API de Facturama.
 *
 * Usa native fetch para stampPayroll (evita acumulación de cookies .ASPXAUTH
 * que causaba errores 400 esporádicos con axios).
 * Usa axios para el resto de operaciones (descarga, email).
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  FacturamaPayrollRequest,
  FacturamaCfdiResponse,
  FacturamaErrorResponse,
} from './types';
import { FacturamaCredentials } from './config';

const SANDBOX_URL    = 'https://apisandbox.facturama.mx';
const PRODUCTION_URL = 'https://api.facturama.mx';

interface FileResponse {
  Content: string; // base64
  ContentType: string;
  Filename: string;
}

export class FacturamaClient {
  private readonly axios: AxiosInstance;
  private readonly baseURL: string;
  private readonly credentials: string; // base64 "user:pass"

  constructor(creds: FacturamaCredentials, useSandbox: boolean) {
    this.baseURL     = useSandbox ? SANDBOX_URL : PRODUCTION_URL;
    this.credentials = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');

    this.axios = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Basic ${this.credentials}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  // ── Stamp ────────────────────────────────────────────────────────────────────

  /**
   * Timbra un CFDI de nómina.
   * POST /3/cfdis
   *
   * Usa native fetch en lugar de axios para evitar que la cookie .ASPXAUTH
   * acumule estado de sesión y cause 400 vacíos en llamadas repetidas.
   */
  async stampPayroll(request: FacturamaPayrollRequest): Promise<FacturamaCfdiResponse> {
    const response = await fetch(`${this.baseURL}/3/cfdis`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(this.parseFacturamaError(response.status, errorBody, 'stamp'));
    }

    return (await response.json()) as FacturamaCfdiResponse;
  }

  // ── Download ─────────────────────────────────────────────────────────────────

  /** Descarga el PDF de un CFDI de nómina. Retorna Buffer. */
  async downloadPdf(facturamaId: string): Promise<Buffer> {
    try {
      const res = await this.axios.get<FileResponse>(`/cfdi/pdf/payroll/${facturamaId}`);
      return Buffer.from(res.data.Content, 'base64');
    } catch (err) {
      throw this.wrapAxiosError(err, 'downloadPdf');
    }
  }

  /** Descarga el XML de un CFDI de nómina. Retorna Buffer. */
  async downloadXml(facturamaId: string): Promise<Buffer> {
    try {
      const res = await this.axios.get<FileResponse>(`/cfdi/xml/payroll/${facturamaId}`);
      return Buffer.from(res.data.Content, 'base64');
    } catch (err) {
      throw this.wrapAxiosError(err, 'downloadXml');
    }
  }

  // ── Cancel ───────────────────────────────────────────────────────────────────

  /**
   * Cancela un CFDI de nómina.
   * Motivos: 01=con relación, 02=sin relación, 03=no se llevó a cabo, 04=nominativa global
   */
  async cancelPayroll(facturamaId: string, motive: string = '02', uuidReplacement?: string): Promise<void> {
    try {
      let url = `/Cfdi/${facturamaId}?type=payroll&motive=${motive}`;
      if (uuidReplacement) url += `&uuidReplacement=${uuidReplacement}`;
      await this.axios.delete(url);
    } catch (err) {
      throw this.wrapAxiosError(err, 'cancel');
    }
  }

  // ── Email ────────────────────────────────────────────────────────────────────

  /** Envía el CFDI de nómina por email. */
  async sendByEmail(facturamaId: string, email: string): Promise<void> {
    try {
      const params = new URLSearchParams({ cfdiType: 'payroll', cfdiId: facturamaId, email });
      await this.axios.post(`/Cfdi?${params.toString()}`, null);
    } catch (err) {
      throw this.wrapAxiosError(err, 'sendEmail');
    }
  }

  // ── Error helpers ────────────────────────────────────────────────────────────

  private parseFacturamaError(status: number, body: string, op: string): string {
    let message = `Facturama ${op} failed (${status})`;
    if (!body) return message;
    try {
      const parsed = JSON.parse(body) as FacturamaErrorResponse;
      message = parsed.Message ? `${message}: ${parsed.Message}` : message;
      if (parsed.ModelState) {
        const details = Object.entries(parsed.ModelState)
          .map(([k, v]) => `${k}: ${v.join(', ')}`)
          .join('; ');
        message += ` [${details}]`;
      }
    } catch {
      message = `${message}: ${body}`;
    }
    return message;
  }

  private wrapAxiosError(err: unknown, op: string): Error {
    if (err instanceof AxiosError && err.response) {
      const data = err.response.data as FacturamaErrorResponse | undefined;
      const msg  = data?.Message ?? 'Unknown error';
      const det  = data?.ModelState
        ? Object.entries(data.ModelState).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')
        : '';
      return new Error(`Facturama ${op} failed (${err.response.status}): ${msg}${det ? ` [${det}]` : ''}`);
    }
    if (err instanceof Error) return new Error(`Facturama ${op} failed: ${err.message}`);
    return new Error(`Facturama ${op} failed: Unknown error`);
  }
}
