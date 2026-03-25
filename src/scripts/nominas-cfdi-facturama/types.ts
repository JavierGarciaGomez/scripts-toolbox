/**
 * Facturama API types — CFDI 4.0 Nómina 1.2
 * Self-contained copy (no dependency on hvp-workspace).
 */

export interface FacturamaPayrollRequest {
  NameId: number;
  ExpeditionPlace: string;
  CfdiType: 'N';
  PaymentMethod: 'PUE';
  Serie?: string;
  Folio?: string;
  Receiver: FacturamaReceiver;
  Complemento: { Payroll: FacturamaPayrollComplement };
}

export interface FacturamaReceiver {
  Rfc: string;
  Name: string;
  CfdiUse: 'CN01';
  FiscalRegime: string;
  TaxZipCode: string;
}

export interface FacturamaPayrollComplement {
  Type: 'O' | 'E';
  PaymentDate: string;        // YYYY-MM-DD
  InitialPaymentDate: string; // YYYY-MM-DD
  FinalPaymentDate: string;   // YYYY-MM-DD
  DaysPaid: number;
  Issuer: { EmployerRegistration: string };
  Employee: FacturamaEmployee;
  Perceptions: { Details: FacturamaPerception[] };
  Deductions?: { Details: FacturamaDeduction[] };
  OtherPayments?: FacturamaOtherPayment[];
}

export interface FacturamaEmployee {
  Curp: string;
  SocialSecurityNumber?: string;
  EmployeeNumber: string;
  Position: string;
  StartDateLaborRelations: string; // YYYY-MM-DD
  ContractType: string;
  RegimeType: string;
  Unionized: boolean;
  TypeOfJourney: string;
  FrequencyPayment: string;
  Bank?: string;
  BankAccount?: string;
  BaseSalary: number;
  DailySalary?: number;
  PositionRisk: string;
  Department?: string;
  FederalEntityKey: string;
}

export interface FacturamaPerception {
  PerceptionType: string;
  Code: string;
  Description: string;
  TaxedAmount: number;
  ExemptAmount: number;
  ExtraHours?: FacturamaExtraHour[];
}

export interface FacturamaExtraHour {
  Days: number;
  HoursType: string; // '01'=Doble, '02'=Triple
  ExtraHours: number;
  PaidAmount: number;
}

export interface FacturamaDeduction {
  DeduccionType: string;
  Code: string;
  Description: string;
  Amount: number;
}

export interface FacturamaOtherPayment {
  OtherPaymentType: string;
  Code: string;
  Description: string;
  Amount: number;
  EmploymentSubsidy?: { Amount: number };
}

export interface FacturamaCfdiResponse {
  Id: string;
  Status: string;
  Folio: string;
  CfdiType: string;
  Serie: string;
  Complement: {
    TaxStamp: {
      Uuid: string;
      Date: string;
      CfdiSign: string;
      SatSign: string;
      SatCertificateNumber: string;
      RfcProvCertif: string;
    };
  };
}

export interface FacturamaErrorResponse {
  Message: string;
  ModelState?: Record<string, string[]>;
}
