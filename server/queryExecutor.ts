import { db } from "./db";
import { companies, sectors, signals } from "@shared/schema";
import { eq, sql, and, or, SQL } from "drizzle-orm";

export interface QueryCondition {
  field: string;
  operator: string;
  value: string;
  logic?: "AND" | "OR";
}

export interface QueryExecutionResult {
  ticker: string;
  name: string;
  sectorName: string;
  revenue: number | null;
  netIncome: number | null;
  roe: number | null;
  pe: number | null;
  debt: number | null;
  marketCap: string | null;
  latestSignal: string | null;
  latestSignalDate: string | null;
}

const NUMERIC_FIELDS = ["revenue", "netIncome", "roe", "pe", "debt", "marketCap"];
const STRING_FIELDS = ["ticker", "name", "sector"];

export class QueryExecutionService {
  async executeQuery(
    conditions: QueryCondition[],
    limit: number = 100,
    offset: number = 0
  ): Promise<{ results: QueryExecutionResult[]; total: number }> {
    if (!conditions || conditions.length === 0) {
      return this.fetchAllCompanies(limit, offset);
    }

    this.validateConditions(conditions);

    const whereClause = this.buildWhereClause(conditions);
    const results = await this.fetchCompaniesWithFilters(whereClause, limit, offset);
    const total = await this.countCompaniesWithFilters(whereClause);

    return { results, total };
  }

  private validateConditions(conditions: QueryCondition[]): void {
    const stringFields = ["ticker", "name", "sector", "signal"];
    const numericFields = ["revenue", "netIncome", "roe", "pe", "debt", "marketCap"];
    const allFields = [...stringFields, ...numericFields];

    const stringOperators = ["=", "contains"];
    const numericOperators = ["=", ">", "<", ">=", "<="];
    const signalOperators = ["="];

    for (const condition of conditions) {
      if (!allFields.includes(condition.field)) {
        throw new Error(`Invalid field: ${condition.field}. Supported fields: ${allFields.join(", ")}`);
      }

      if (!condition.value && condition.value !== "0" && condition.value !== "") {
        throw new Error(`Missing value for condition on field: ${condition.field}`);
      }

      if (condition.field === "signal") {
        if (!signalOperators.includes(condition.operator)) {
          throw new Error(`Invalid operator "${condition.operator}" for field "signal". Supported: ${signalOperators.join(", ")}`);
        }
      } else if (numericFields.includes(condition.field)) {
        if (!numericOperators.includes(condition.operator)) {
          throw new Error(`Invalid operator "${condition.operator}" for numeric field "${condition.field}". Supported: ${numericOperators.join(", ")}`);
        }
        const numValue = parseFloat(condition.value);
        if (isNaN(numValue)) {
          throw new Error(`Invalid numeric value "${condition.value}" for field "${condition.field}"`);
        }
      } else if (stringFields.includes(condition.field)) {
        if (!stringOperators.includes(condition.operator)) {
          throw new Error(`Invalid operator "${condition.operator}" for string field "${condition.field}". Supported: ${stringOperators.join(", ")}`);
        }
      }
    }
  }

  private buildWhereClause(conditions: QueryCondition[]): SQL | undefined {
    if (conditions.length === 0) return undefined;

    const clauses: SQL[] = [];

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const clause = this.buildConditionClause(condition);
      clauses.push(clause);
    }

    if (clauses.length === 0) return undefined;
    if (clauses.length === 1) return clauses[0];

    let combined: SQL = clauses[0];
    
    for (let i = 1; i < clauses.length; i++) {
      const logic = conditions[i].logic || "AND";
      const nextClause = clauses[i];
      
      if (logic === "AND") {
        combined = sql`(${combined}) AND (${nextClause})`;
      } else {
        combined = sql`(${combined}) OR (${nextClause})`;
      }
    }

    return combined;
  }

  private buildConditionClause(condition: QueryCondition): SQL {
    const { field, operator, value } = condition;

    if (field === "ticker") {
      return this.applyOperator(companies.ticker, operator, value, false);
    }

    if (field === "name") {
      return this.applyOperator(companies.name, operator, value, false);
    }

    if (field === "sector") {
      return this.applyOperator(sectors.name, operator, value, false);
    }

    if (field === "marketCap") {
      return this.applyOperator(companies.marketCap, operator, value, true);
    }

    if (NUMERIC_FIELDS.includes(field) && field !== "marketCap") {
      const jsonPath = sql`(${companies.financialData}->>${field})::numeric`;
      return this.applyOperatorToJson(jsonPath, operator, value);
    }

    if (field === "signal") {
      return sql`EXISTS (
        SELECT 1 FROM ${signals} s 
        WHERE s.company_id = ${companies.id} 
        AND s.signal = ${value}
        AND s.created_at = (
          SELECT MAX(created_at) FROM ${signals} 
          WHERE company_id = ${companies.id}
        )
      )`;
    }

    throw new Error(`Unsupported field: ${field}`);
  }

  private applyOperator(column: any, operator: string, value: string, isNumeric: boolean): SQL {
    const targetValue = isNumeric ? parseFloat(value) : value;

    switch (operator) {
      case "=":
        return eq(column, targetValue as any);
      case ">":
        return sql`${column} > ${targetValue}`;
      case "<":
        return sql`${column} < ${targetValue}`;
      case ">=":
        return sql`${column} >= ${targetValue}`;
      case "<=":
        return sql`${column} <= ${targetValue}`;
      case "contains":
        return sql`${column} ILIKE ${`%${value}%`}`;
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  private applyOperatorToJson(jsonPath: SQL, operator: string, value: string): SQL {
    const numValue = parseFloat(value);

    switch (operator) {
      case "=":
        return sql`${jsonPath} = ${numValue}`;
      case ">":
        return sql`${jsonPath} > ${numValue}`;
      case "<":
        return sql`${jsonPath} < ${numValue}`;
      case ">=":
        return sql`${jsonPath} >= ${numValue}`;
      case "<=":
        return sql`${jsonPath} <= ${numValue}`;
      default:
        throw new Error(`Unsupported operator for numeric field: ${operator}`);
    }
  }

  private async fetchCompaniesWithFilters(
    whereClause: SQL | undefined,
    limit: number,
    offset: number
  ): Promise<QueryExecutionResult[]> {
    const baseQuery = db
      .select({
        ticker: companies.ticker,
        name: companies.name,
        sectorName: sectors.name,
        marketCap: companies.marketCap,
        financialData: companies.financialData,
        companyId: companies.id,
      })
      .from(companies)
      .leftJoin(sectors, eq(companies.sectorId, sectors.id));

    const query = whereClause 
      ? baseQuery.where(whereClause)
      : baseQuery;

    const companiesData = await query.limit(limit).offset(offset);

    if (companiesData.length === 0) {
      return [];
    }

    const companyIds = companiesData.map(c => c.companyId);

    const latestSignalsQuery = await db
      .select({
        companyId: signals.companyId,
        signal: signals.signal,
        createdAt: signals.createdAt,
      })
      .from(signals)
      .where(sql`${signals.companyId} = ANY(${companyIds}) AND ${signals.createdAt} = (
        SELECT MAX(created_at) 
        FROM ${signals} s2 
        WHERE s2.company_id = ${signals.companyId}
      )`);

    const signalsMap = new Map(
      latestSignalsQuery.map(s => [s.companyId, s])
    );

    const enrichedResults = companiesData.map((company) => {
      const latestSignal = signalsMap.get(company.companyId);
      const financialData = company.financialData as any || {};

      return {
        ticker: company.ticker,
        name: company.name,
        sectorName: company.sectorName || "Unknown",
        revenue: financialData.revenue || null,
        netIncome: financialData.netIncome || null,
        roe: financialData.roe || null,
        pe: financialData.pe || null,
        debt: financialData.debt || null,
        marketCap: company.marketCap || null,
        latestSignal: latestSignal?.signal || null,
        latestSignalDate: latestSignal?.createdAt?.toISOString() || null,
      };
    });

    return enrichedResults;
  }

  private async countCompaniesWithFilters(whereClause: SQL | undefined): Promise<number> {
    const baseQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(companies)
      .leftJoin(sectors, eq(companies.sectorId, sectors.id));

    const query = whereClause 
      ? baseQuery.where(whereClause)
      : baseQuery;

    const result = await query;
    return Number(result[0]?.count || 0);
  }

  private async fetchAllCompanies(limit: number, offset: number): Promise<{ results: QueryExecutionResult[]; total: number }> {
    const results = await this.fetchCompaniesWithFilters(undefined, limit, offset);
    const total = await this.countCompaniesWithFilters(undefined);
    return { results, total };
  }
}

export const queryExecutor = new QueryExecutionService();
