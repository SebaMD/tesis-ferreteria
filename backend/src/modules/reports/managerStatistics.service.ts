import {
  findManagerStatisticsData,
  type ManagerStatisticsSource,
} from "./managerStatistics.repository.js";
import type { ReportDateRange } from "./reports.validation.js";

type ProductAggregate = {
  productId: number;
  productName: string;
  units: number;
  revenueCents: number;
};

type AmountAggregate = {
  amountCents: number;
  transactions: number;
};

function toCents(value: string | number | null | undefined) {
  return Math.round(Number(value || 0) * 100);
}

function fromCents(value: number) {
  return value / 100;
}

function dateKey(value: Date | string) {
  // PostgreSQL expressions such as COALESCE are returned as strings by the
  // driver even when their TypeScript projection is declared as Date.
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 10_000) / 100 : 0;
}

function addAmount(map: Map<string, AmountAggregate>, key: string, amountCents: number) {
  const current = map.get(key) ?? { amountCents: 0, transactions: 0 };
  current.amountCents += amountCents;
  current.transactions += 1;
  map.set(key, current);
}

function addProduct(
  map: Map<number, ProductAggregate>,
  productId: number,
  productName: string,
  units: number,
  revenueCents: number,
) {
  if (units <= 0) return;
  const current = map.get(productId) ?? { productId, productName, units: 0, revenueCents: 0 };
  current.units += units;
  current.revenueCents += revenueCents;
  map.set(productId, current);
}

function createEvolution(filters: ReportDateRange) {
  const days = new Map<string, {
    date: string;
    originalCents: number;
    returnedCents: number;
    netCents: number;
    transactions: number;
  }>();
  const cursor = new Date(filters.from);
  while (cursor < filters.toExclusive) {
    const key = dateKey(cursor);
    days.set(key, {
      date: key,
      originalCents: 0,
      returnedCents: 0,
      netCents: 0,
      transactions: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function buildManagerStatistics(
  source: ManagerStatisticsSource,
  filters: ReportDateRange,
) {
  const evolution = createEvolution(filters);
  const channels = new Map<string, AmountAggregate>();
  const paymentMethods = new Map<string, AmountAggregate>();
  const products = new Map<number, ProductAggregate>();
  const pointOfSale = new Map<number, {
    date: Date;
    paymentMethod: string;
    totalCents: number;
    status: string;
    returnedCents: number;
    items: Array<{
      productId: number;
      productName: string;
      quantity: number;
      returnedQuantity: number;
      unitPriceCents: number;
    }>;
  }>();
  const online = new Map<number, {
    date: Date;
    totalCents: number;
    items: Array<{
      productId: number;
      productName: string;
      quantity: number;
      revenueCents: number;
    }>;
  }>();

  for (const row of source.pointOfSaleRows) {
    const sale = pointOfSale.get(row.saleId) ?? {
      date: row.date,
      paymentMethod: row.paymentMethod,
      totalCents: toCents(row.saleTotal),
      status: row.saleStatus,
      returnedCents: 0,
      items: [],
    };
    const returnedQuantity = Number(row.returnedQuantity || 0);
    const unitPriceCents = toCents(row.unitPrice);
    sale.returnedCents += returnedQuantity * unitPriceCents;
    sale.items.push({
      productId: row.productId,
      productName: row.productName,
      quantity: Number(row.quantity),
      returnedQuantity,
      unitPriceCents,
    });
    pointOfSale.set(row.saleId, sale);
  }

  for (const row of source.onlineRows) {
    const order = online.get(row.orderId) ?? {
      date: row.commercialDate,
      totalCents: toCents(row.orderTotal),
      items: [],
    };
    order.items.push({
      productId: row.productId,
      productName: row.productName,
      quantity: Number(row.quantity),
      revenueCents: toCents(row.subtotal),
    });
    online.set(row.orderId, order);
  }

  let originalCents = 0;
  let returnedCents = 0;
  let netCents = 0;
  let unitsSold = 0;

  for (const sale of pointOfSale.values()) {
    const effectiveReturnedCents = sale.status === "CANCELLED"
      ? sale.totalCents
      : Math.min(sale.returnedCents, sale.totalCents);
    const saleNetCents = Math.max(sale.totalCents - effectiveReturnedCents, 0);
    originalCents += sale.totalCents;
    returnedCents += effectiveReturnedCents;
    netCents += saleNetCents;
    addAmount(channels, "IN_STORE", saleNetCents);
    addAmount(paymentMethods, sale.paymentMethod, saleNetCents);

    const day = evolution.get(dateKey(sale.date));
    if (day) {
      day.originalCents += sale.totalCents;
      day.returnedCents += effectiveReturnedCents;
      day.netCents += saleNetCents;
      day.transactions += 1;
    }

    for (const item of sale.items) {
      const netUnits = Math.max(item.quantity - item.returnedQuantity, 0);
      unitsSold += netUnits;
      addProduct(
        products,
        item.productId,
        item.productName,
        netUnits,
        netUnits * item.unitPriceCents,
      );
    }
  }

  for (const order of online.values()) {
    originalCents += order.totalCents;
    netCents += order.totalCents;
    addAmount(channels, "ONLINE", order.totalCents);
    addAmount(paymentMethods, "WEBPAY_PLUS", order.totalCents);

    const day = evolution.get(dateKey(order.date));
    if (day) {
      day.originalCents += order.totalCents;
      day.netCents += order.totalCents;
      day.transactions += 1;
    }

    for (const item of order.items) {
      unitsSold += item.quantity;
      addProduct(
        products,
        item.productId,
        item.productName,
        item.quantity,
        item.revenueCents,
      );
    }
  }

  const transactions = pointOfSale.size + online.size;
  const channelLabels: Record<string, string> = {
    IN_STORE: "Venta presencial",
    ONLINE: "Venta online",
  };

  return {
    period: { from: filters.fromLabel, to: filters.toLabel },
    kpis: {
      netSales: fromCents(netCents),
      originalSales: fromCents(originalCents),
      returnedAmount: fromCents(returnedCents),
      returnPercentage: percentage(returnedCents, originalCents),
      transactions,
      averageTicket: transactions > 0 ? fromCents(Math.round(netCents / transactions)) : 0,
      unitsSold,
      productsSold: products.size,
    },
    evolution: [...evolution.values()].map((day) => ({
      date: day.date,
      originalSales: fromCents(day.originalCents),
      returnedAmount: fromCents(day.returnedCents),
      netSales: fromCents(day.netCents),
      transactions: day.transactions,
    })),
    channels: [...channels.entries()].map(([channel, values]) => ({
      channel,
      label: channelLabels[channel] ?? channel,
      amount: fromCents(values.amountCents),
      transactions: values.transactions,
      percentage: percentage(values.amountCents, netCents),
    })).sort((left, right) => right.amount - left.amount),
    paymentMethods: [...paymentMethods.entries()].map(([paymentMethod, values]) => ({
      paymentMethod,
      amount: fromCents(values.amountCents),
      transactions: values.transactions,
      percentage: percentage(values.amountCents, netCents),
    })).sort((left, right) => right.amount - left.amount),
    topProducts: [...products.values()]
      .map((product) => ({
        productId: product.productId,
        productName: product.productName,
        units: product.units,
        revenue: fromCents(product.revenueCents),
      }))
      .sort((left, right) => right.units - left.units
        || right.revenue - left.revenue
        || left.productName.localeCompare(right.productName, "es"))
      .slice(0, 10),
    lowStock: {
      count: source.lowStockProducts.length,
      products: source.lowStockProducts.map((product) => ({
        ...product,
        deficit: Math.max(Number(product.minimumStock) - Number(product.currentStock), 0),
      })),
    },
  };
}

export async function getManagerStatisticsService(filters: ReportDateRange) {
  return buildManagerStatistics(await findManagerStatisticsData(filters), filters);
}
