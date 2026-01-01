import * as fs from "fs";
import * as path from "path";

// Define interfaces for type safety
interface GeneralData {
  fullName: string;
  collaboratorCode: string;
  curp: string;
  socialSecurityNumber: string;
  rfcNumber: string;
  jobTitle: string;
  paymentType: string;
  contributionBaseSalary: number;
}

interface ExtraVariableCompensation {
  name: string;
  description: string;
  amount: number;
  _id: string;
}

interface Earnings {
  halfWeekFixedIncome: number;
  halfWeekHourlyPay: number;
  additionalFixedIncomes: Array<{ name: string; amount: number }>;
  commissions: number;
  vacationCompensation: number;
  expressBranchCompensation: number;
  mealCompensation: number;
  receptionBonus: number;
  punctualityBonus: number;
  absencesJustifiedByCompanyCompensation: number;
  specialBonuses: Array<{ name: string; amount: number }>;
  guaranteedIncomeCompensation: number;
  simpleOvertimeHours: number;
  doubleOvertimeHours: number;
  tripleOvertimeHours: number;
  sundayBonus: number;
  holidayOrRestExtraPay: number;
  traniningActivitySupport: number;
  physicalActivitySupport: number;
  extraVariableCompensations: ExtraVariableCompensation[];
  vacationBonus: number;
  endYearBonus: number;
  profitSharing: number;
  employmentSubsidy: number;
}

interface Deductions {
  incomeTaxWithholding: number;
  socialSecurityWithholding: number;
  otherFixedDeductions: Array<{ name: string; amount: number }>;
  otherVariableDeductions: Array<{ name: string; amount: number }>;
  nonCountedDaysDiscount: number;
  justifiedAbsencesDiscount: number;
  unjustifiedAbsencesDiscount: number;
  unworkedHoursDiscount: number;
  tardinessDiscount: number;
}

interface Totals {
  totalIncome: number;
  totalDeductions: number;
  netPay: number;
}

interface ContextData {
  attendanceFactor: number;
  employerImssRate: number;
  workedHours: number;
}

interface PayrollRecord {
  payrollStatus: string;
  generalData: GeneralData;
  earnings: Earnings;
  deductions: Deductions;
  totals: Totals;
  contextData: ContextData;
  collaboratorId: string;
  jobId: string;
  periodStartDate: string;
  periodEndDate: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  id: string;
}

interface PayrollSummary {
  totals: {
    earnings: Record<string, number>;
    deductions: Record<string, number>;
  };
  monthlyAverages: {
    earnings: Record<string, number>;
    deductions: Record<string, number>;
  };
}

// Read the payroll data
const dataPath = path.join(__dirname, "data.json");
const payrollData: PayrollRecord[] = JSON.parse(
  fs.readFileSync(dataPath, "utf8")
);

console.log(`Processing ${payrollData.length} payroll records...`);

// Initialize totals objects
const earningsTotals: Record<string, number> = {};
const deductionsTotals: Record<string, number> = {};

// Process each payroll record
payrollData.forEach((record, index) => {
  console.log(
    `Processing record ${index + 1}/${payrollData.length} - ${
      record.generalData.fullName
    }`
  );

  // Process earnings
  Object.entries(record.earnings).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      // Handle arrays (like additionalFixedIncomes, specialBonuses, extraVariableCompensations)
      if (key === "extraVariableCompensations") {
        (value as ExtraVariableCompensation[]).forEach((comp) => {
          const compKey = `extraVariableCompensations_${comp.name}`;
          earningsTotals[compKey] =
            (earningsTotals[compKey] || 0) + (comp.amount || 0);
        });
      } else {
        // For other arrays, sum their amounts
        const arrayTotal = (value as Array<{ amount: number }>).reduce(
          (sum, item) => sum + (item.amount || 0),
          0
        );
        earningsTotals[key] = (earningsTotals[key] || 0) + arrayTotal;
      }
    } else if (typeof value === "number") {
      earningsTotals[key] = (earningsTotals[key] || 0) + value;
    }
  });

  // Process deductions
  Object.entries(record.deductions).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      // Handle arrays (like otherFixedDeductions, otherVariableDeductions)
      const arrayTotal = (value as Array<{ amount: number }>).reduce(
        (sum, item) => sum + (item.amount || 0),
        0
      );
      deductionsTotals[key] = (deductionsTotals[key] || 0) + arrayTotal;
    } else if (typeof value === "number") {
      deductionsTotals[key] = (deductionsTotals[key] || 0) + value;
    }
  });
});

// Calculate monthly averages (divide by 12 since we have 24 half-months)
const earningsMonthlyAverage: Record<string, number> = {};
const deductionsMonthlyAverage: Record<string, number> = {};

Object.entries(earningsTotals).forEach(([key, value]) => {
  earningsMonthlyAverage[key] = value / 12;
});

Object.entries(deductionsTotals).forEach(([key, value]) => {
  deductionsMonthlyAverage[key] = value / 12;
});

// Create the summary object
const summary: PayrollSummary = {
  totals: {
    earnings: earningsTotals,
    deductions: deductionsTotals,
  },
  monthlyAverages: {
    earnings: earningsMonthlyAverage,
    deductions: deductionsMonthlyAverage,
  },
};

// Write the summary to a new file
const outputPath = path.join(__dirname, "payroll-summary.json");
fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

console.log("\n=== SUMMARY GENERATED ===");
console.log(`Total earnings concepts: ${Object.keys(earningsTotals).length}`);
console.log(
  `Total deductions concepts: ${Object.keys(deductionsTotals).length}`
);
console.log(`Output saved to: ${outputPath}`);

// Display some key totals
console.log("\n=== KEY EARNINGS TOTALS ===");
const keyEarnings = [
  "halfWeekFixedIncome",
  "commissions",
  "vacationCompensation",
  "mealCompensation",
  "vacationBonus",
];
keyEarnings.forEach((key) => {
  if (
    earningsTotals[key] !== undefined &&
    earningsMonthlyAverage[key] !== undefined
  ) {
    console.log(
      `${key}: $${earningsTotals[key].toFixed(
        2
      )} (Monthly avg: $${earningsMonthlyAverage[key].toFixed(2)})`
    );
  }
});

console.log("\n=== KEY DEDUCTIONS TOTALS ===");
const keyDeductions = ["incomeTaxWithholding", "socialSecurityWithholding"];
keyDeductions.forEach((key) => {
  if (
    deductionsTotals[key] !== undefined &&
    deductionsMonthlyAverage[key] !== undefined
  ) {
    console.log(
      `${key}: $${deductionsTotals[key].toFixed(
        2
      )} (Monthly avg: $${deductionsMonthlyAverage[key].toFixed(2)})`
    );
  }
});

console.log("\n=== GRAND TOTALS ===");
const totalEarnings = Object.values(earningsTotals).reduce(
  (sum, val) => sum + val,
  0
);
const totalDeductions = Object.values(deductionsTotals).reduce(
  (sum, val) => sum + val,
  0
);
console.log(
  `Total Earnings: $${totalEarnings.toFixed(2)} (Monthly avg: $${(
    totalEarnings / 12
  ).toFixed(2)})`
);
console.log(
  `Total Deductions: $${totalDeductions.toFixed(2)} (Monthly avg: $${(
    totalDeductions / 12
  ).toFixed(2)})`
);
console.log(
  `Net Total: $${(totalEarnings - totalDeductions).toFixed(
    2
  )} (Monthly avg: $${((totalEarnings - totalDeductions) / 12).toFixed(2)})`
);
