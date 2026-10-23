import type { Service } from './types';

export interface CostBreakdownItem {
  label: string;
  amount: number;
}

export interface PricingInput {
  baseCost: number;
  materialsCost: number;
  printingCost: number;
  commissionPercent: number;
  otherCosts: number;
  sellingPrice: number;
  discountPercent: number;
}

export interface PricingResult {
  totalCost: CostBreakdownItem[];
  totalCostAmount: number;
  discountedPrice: number;
  discountAmount: number;
  marginOnSale: number;
  marginOnSalePercent: number;
  markupOnCost: number;
  markupOnCostPercent: number;
  suggestedMinPrice: number;
  profit: number;
}

export function calculatePricing(input: PricingInput): PricingResult {
  const commissionAmount = input.sellingPrice * (input.commissionPercent / 100);

  const costItems: CostBreakdownItem[] = [
    { label: 'Custo base do serviço', amount: round2(input.baseCost) },
    { label: 'Materiais', amount: round2(input.materialsCost) },
    { label: 'Impressões', amount: round2(input.printingCost) },
    { label: `Comissão (${input.commissionPercent}%)`, amount: round2(commissionAmount) },
    { label: 'Outros custos', amount: round2(input.otherCosts) },
  ];

  const totalCostAmount = round2(costItems.reduce((s, c) => s + c.amount, 0));
  const discountAmount = round2(input.sellingPrice * (input.discountPercent / 100));
  const discountedPrice = round2(input.sellingPrice - discountAmount);

  const marginOnSale = round2(discountedPrice - totalCostAmount);
  const marginOnSalePercent = discountedPrice > 0 ? round2((marginOnSale / discountedPrice) * 100) : 0;

  const markupOnCost = marginOnSale;
  const markupOnCostPercent = totalCostAmount > 0 ? round2((markupOnCost / totalCostAmount) * 100) : 0;

  // Suggested minimum: 30% markup on cost (configurable later)
  const suggestedMinPrice = round2(totalCostAmount * 1.3);

  const profit = marginOnSale;

  return {
    totalCost: costItems.filter((c) => c.amount > 0),
    totalCostAmount,
    discountedPrice,
    discountAmount,
    marginOnSale,
    marginOnSalePercent,
    markupOnCost,
    markupOnCostPercent,
    suggestedMinPrice,
    profit,
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ReportPeriodData {
  revenue: number;
  expenses: number;
  result: number;
  receivable: number;
  payable: number;
  avgTicket: number;
  salesCount: number;
  budgetCount: number;
  approvedCount: number;
  conversionRate: number;
}

export function buildReportPeriodData(
  entries: { total_amount: number; paid_amount: number; status: string; due_date: string; budget_id: string | null }[],
  expenses: { amount: number; paid_amount: number; status: string; due_date: string }[],
  budgets: { status: string; created_at: string; total: number }[],
  periodStart: string,
  periodEnd: string,
): ReportPeriodData {
  const periodEntries = entries.filter((e) => e.due_date >= periodStart && e.due_date <= periodEnd);
  const periodExpenses = expenses.filter((e) => e.due_date >= periodStart && e.due_date <= periodEnd);
  const periodBudgets = budgets.filter((b) => b.created_at >= periodStart && b.created_at <= periodEnd + 'T23:59:59');

  const paidEntries = periodEntries.filter((e) => e.status === 'pago');
  const revenue = round2(paidEntries.reduce((s, e) => s + e.paid_amount, 0));
  const expensesPaid = round2(periodExpenses.filter((e) => e.status === 'pago').reduce((s, e) => s + e.paid_amount, 0));
  const receivable = round2(periodEntries.filter((e) => e.status !== 'pago').reduce((s, e) => s + (e.total_amount - e.paid_amount), 0));
  const payable = round2(periodExpenses.filter((e) => e.status !== 'pago').reduce((s, e) => s + (e.amount - e.paid_amount), 0));

  const salesCount = paidEntries.length;
  const avgTicket = salesCount > 0 ? round2(revenue / salesCount) : 0;
  const budgetCount = periodBudgets.length;
  const approvedCount = periodBudgets.filter((b) => b.status === 'aprovado').length;
  const conversionRate = budgetCount > 0 ? round2((approvedCount / budgetCount) * 100) : 0;

  return {
    revenue,
    expenses: expensesPaid,
    result: round2(revenue - expensesPaid),
    receivable,
    payable,
    avgTicket,
    salesCount,
    budgetCount,
    approvedCount,
    conversionRate,
  };
}

export interface ServiceComparisonRow {
  serviceName: string;
  code: string;
  price: number;
  cost: number;
  margin: number;
  marginPercent: number;
  markupPercent: number;
}

export function buildServiceComparison(services: Service[]): ServiceComparisonRow[] {
  return services.map((s) => {
    const margin = round2(s.price - s.cost);
    const marginPercent = s.price > 0 ? round2((margin / s.price) * 100) : 0;
    const markupPercent = s.cost > 0 ? round2((margin / s.cost) * 100) : 0;
    return {
      serviceName: s.name,
      code: s.code,
      price: s.price,
      cost: s.cost,
      margin,
      marginPercent,
      markupPercent,
    };
  });
}
