import { findSalesForReport, type ReportSale } from "./reports.repository.js";
import type { ReportDateRange } from "./reports.validation.js";

type PaymentSummary = {
  paymentMethod: string;
  salesCount: number;
  total: number;
};

type CashierSummary = {
  cashierId: number;
  cashierNames: string;
  cashierSurnames: string;
  cashierName: string;
  salesCount: number;
  total: number;
  totalByPaymentMethod: PaymentSummary[];
};

function toCents(value: string) {
  return Math.round(Number(value) * 100);
}

function fromCents(value: number) {
  return value / 100;
}

function addPaymentTotal(map: Map<string, { salesCount: number; totalCents: number }>, sale: ReportSale) {
  const current = map.get(sale.paymentMethod) ?? { salesCount: 0, totalCents: 0 };
  current.salesCount += 1;
  current.totalCents += toCents(sale.total);
  map.set(sale.paymentMethod, current);
}

function paymentSummary(map: Map<string, { salesCount: number; totalCents: number }>): PaymentSummary[] {
  return [...map.entries()]
    .map(([paymentMethod, values]) => ({
      paymentMethod,
      salesCount: values.salesCount,
      total: fromCents(values.totalCents),
    }))
    .sort((left, right) => right.total - left.total);
}

function aggregateSales(sales: ReportSale[]) {
  const activeSales = sales.filter((sale) => sale.status === "ACTIVE");
  const paymentTotals = new Map<string, { salesCount: number; totalCents: number }>();
  const cashierTotals = new Map<
    number,
    {
      cashierNames: string;
      cashierSurnames: string;
      salesCount: number;
      totalCents: number;
      payments: Map<string, { salesCount: number; totalCents: number }>;
    }
  >();

  let totalCents = 0;

  for (const sale of sales) {
    if (!cashierTotals.has(sale.cashierId)) {
      cashierTotals.set(sale.cashierId, {
        cashierNames: sale.cashierNames,
        cashierSurnames: sale.cashierSurnames,
        salesCount: 0,
        totalCents: 0,
        payments: new Map<string, { salesCount: number; totalCents: number }>(),
      });
    }
  }

  for (const sale of activeSales) {
    const saleCents = toCents(sale.total);
    totalCents += saleCents;
    addPaymentTotal(paymentTotals, sale);

    const cashier = cashierTotals.get(sale.cashierId) ?? {
      cashierNames: sale.cashierNames,
      cashierSurnames: sale.cashierSurnames,
      salesCount: 0,
      totalCents: 0,
      payments: new Map<string, { salesCount: number; totalCents: number }>(),
    };

    cashier.salesCount += 1;
    cashier.totalCents += saleCents;
    addPaymentTotal(cashier.payments, sale);
    cashierTotals.set(sale.cashierId, cashier);
  }

  const byCashier: CashierSummary[] = [...cashierTotals.entries()]
    .map(([cashierId, values]) => ({
      cashierId,
      cashierNames: values.cashierNames,
      cashierSurnames: values.cashierSurnames,
      cashierName: `${values.cashierNames} ${values.cashierSurnames}`.trim(),
      salesCount: values.salesCount,
      total: fromCents(values.totalCents),
      totalByPaymentMethod: paymentSummary(values.payments),
    }))
    .sort((left, right) => right.total - left.total);

  return {
    total: fromCents(totalCents),
    salesCount: activeSales.length,
    byPaymentMethod: paymentSummary(paymentTotals),
    byCashier,
  };
}

export async function getDailySalesReportService(filters: ReportDateRange) {
  const sales = await findSalesForReport(filters);
  const summary = aggregateSales(sales);

  return {
    date: filters.fromLabel,
    total: summary.total,
    salesCount: summary.salesCount,
    byPaymentMethod: summary.byPaymentMethod,
    byCashier: summary.byCashier,
  };
}

export async function getSalesReportService(filters: ReportDateRange) {
  const sales = await findSalesForReport(filters);
  const summary = aggregateSales(sales);

  return {
    filters: {
      from: filters.fromLabel,
      to: filters.toLabel,
      cashierId: filters.cashierId ?? null,
      paymentMethod: filters.paymentMethod ?? null,
    },
    sales,
    total: summary.total,
    salesCount: summary.salesCount,
    byCashier: summary.byCashier,
    byPaymentMethod: summary.byPaymentMethod,
  };
}

export async function getSalesByCashierReportService(filters: ReportDateRange) {
  const sales = await findSalesForReport(filters);
  const summary = aggregateSales(sales);

  return {
    from: filters.fromLabel,
    to: filters.toLabel,
    cashiers: summary.byCashier,
  };
}
