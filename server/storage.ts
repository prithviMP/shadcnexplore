import { db } from "./db";
import {
  users,
  sectors,
  companies,
  formulas,
  queries,
  signals,
  sessions,
  otpCodes,
  rolePermissions,
  quarterlyData,
  customTables,
  sectorMappings,
  scrapingLogs,
  sectorUpdateHistory,
  bulkImportJobs,
  bulkImportItems,
  type User,
  type InsertUser,
  type Sector,
  type InsertSector,
  type Company,
  type InsertCompany,
  type Formula,
  type InsertFormula,
  type Query,
  type InsertQuery,
  type Signal,
  type InsertSignal,
  type Session,
  type OtpCode,
  type InsertOtpCode,
  type RolePermission,
  type InsertRolePermission,
  type QuarterlyData,
  type InsertQuarterlyData,
  type CustomTable,
  type InsertCustomTable,
  type SectorMapping,
  type InsertSectorMapping,
  type ScrapingLog,
  type InsertScrapingLog,
  type SectorUpdateHistory,
  type InsertSectorUpdateHistory,
  type BulkImportJob,
  type InsertBulkImportJob,
  type BulkImportItem,
  type InsertBulkImportItem,
  type SchedulerSettings,
  type InsertSchedulerSettings,
  schedulerSettings,
  type SectorSchedule,
  type InsertSectorSchedule,
  sectorSchedules
} from "@shared/schema";
import { eq, and, inArray, desc, sql, gte, lte, lt, or, isNull, max } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getAdminUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  // Session operations
  createSession(userId: string): Promise<Session>;
  getSession(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;

  // OTP operations
  createOtpCode(otp: InsertOtpCode): Promise<OtpCode>;
  getOtpCode(phone: string, code: string): Promise<OtpCode | undefined>;
  markOtpCodeAsUsed(id: string): Promise<void>;
  deleteExpiredOtpCodes(): Promise<void>;

  // Role Permissions operations
  getRolePermissions(role: string): Promise<RolePermission | undefined>;
  getAllRolePermissions(): Promise<RolePermission[]>;
  upsertRolePermissions(role: string, permissions: any): Promise<RolePermission>;

  // Quarterly Data operations
  getQuarterlyDataByTicker(ticker: string): Promise<QuarterlyData[]>;
  getQuarterlyDataByCompany(companyId: string): Promise<QuarterlyData[]>;
  getQuarterlyDataBySector(sectorId: string): Promise<QuarterlyData[]>;
  createQuarterlyData(data: InsertQuarterlyData): Promise<QuarterlyData>;
  bulkCreateQuarterlyData(data: InsertQuarterlyData[]): Promise<QuarterlyData[]>;
  deleteQuarterlyDataByTicker(ticker: string): Promise<void>;

  // Sector operations
  getSector(id: string): Promise<Sector | undefined>;
  getSectorByName(name: string): Promise<Sector | undefined>;
  getAllSectors(): Promise<Sector[]>;
  createSector(sector: InsertSector): Promise<Sector>;
  updateSector(id: string, data: Partial<InsertSector>): Promise<Sector | undefined>;
  deleteSector(id: string): Promise<void>;

  // Company operations
  getCompany(id: string): Promise<Company | undefined>;
  getCompanyByTicker(ticker: string): Promise<Company | undefined>;
  getCompanyByTickerAndSector(ticker: string, sectorId: string): Promise<Company | undefined>;
  getAllCompanies(): Promise<Company[]>;
  getCompaniesBySector(sectorId: string): Promise<Company[]>;
  getCompaniesBySectorAndMarketCap(sectorId: string, minCap?: number, maxCap?: number): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  bulkCreateCompanies(companies: InsertCompany[]): Promise<Company[]>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;
  bulkDeleteCompanies(ids: string[]): Promise<void>;

  // Formula operations
  getFormula(id: string): Promise<Formula | undefined>;
  getAllFormulas(): Promise<Formula[]>;
  getFormulasByScope(scope: string): Promise<Formula[]>;
  createFormula(formula: InsertFormula): Promise<Formula>;
  updateFormula(id: string, data: Partial<InsertFormula>): Promise<Formula | undefined>;
  deleteFormula(id: string): Promise<void>;

  // Query operations
  getQuery(id: string): Promise<Query | undefined>;
  getAllQueries(): Promise<Query[]>;
  getQueriesByUser(userId: string): Promise<Query[]>;
  createQuery(query: InsertQuery): Promise<Query>;
  updateQuery(id: string, data: Partial<InsertQuery>): Promise<Query | undefined>;
  deleteQuery(id: string): Promise<void>;

  // Signal operations
  getSignal(id: string): Promise<Signal | undefined>;
  getSignalsByCompany(companyId: string): Promise<Signal[]>;
  getSignalsByFormula(formulaId: string): Promise<Signal[]>;
  getAllSignals(): Promise<Signal[]>;
  createSignal(signal: InsertSignal): Promise<Signal>;
  deleteSignal(id: string): Promise<void>;
  deleteSignalsByCompany(companyId: string): Promise<void>;
  getStaleSignalCount(): Promise<number>;
  getSignalStatistics(): Promise<{
    totalSignals: number;
    staleSignals: number;
    lastCalculationTime: Date | null;
    signalsByType: { signal: string; count: number }[];
  }>;
  getSignalDistribution(): Promise<{ signal: string; count: number }[]>;

  // Custom Table operations
  getCustomTable(id: string): Promise<CustomTable | undefined>;
  getAllCustomTables(): Promise<CustomTable[]>;
  getCustomTablesByUser(userId: string): Promise<CustomTable[]>;
  getCustomTablesByType(tableType: string): Promise<CustomTable[]>;
  getCustomTablesBySector(sectorId: string): Promise<CustomTable[]>;
  getCustomTablesByCompany(companyId: string): Promise<CustomTable[]>;
  createCustomTable(table: InsertCustomTable): Promise<CustomTable>;
  updateCustomTable(id: string, data: Partial<InsertCustomTable>): Promise<CustomTable | undefined>;
  deleteCustomTable(id: string): Promise<void>;

  // Sector Mapping operations
  getSectorMappingsByCustomSector(sectorId: string): Promise<SectorMapping[]>;
  getSectorMappingsByScreenerSector(screenerSector: string): Promise<SectorMapping[]>;
  getScreenerSectorsForCustomSector(sectorId: string): Promise<string[]>;
  createSectorMapping(mapping: InsertSectorMapping): Promise<SectorMapping>;
  deleteSectorMapping(id: string): Promise<void>;

  // Scraping Log operations
  createScrapingLog(log: InsertScrapingLog): Promise<ScrapingLog>;
  getScrapingLogsByCompany(companyId: string): Promise<ScrapingLog[]>;
  getScrapingLogsByTicker(ticker: string): Promise<ScrapingLog[]>;
  getLastScrapeTime(ticker: string): Promise<Date | null>;
  getScrapingLogs(filters?: { companyId?: string; sectorId?: string; status?: string; limit?: number }): Promise<ScrapingLog[]>;
  updateScrapingLog(id: string, data: Partial<InsertScrapingLog>): Promise<ScrapingLog | undefined>;
  deleteScrapingLog(id: string): Promise<void>;

  // Sector Update History operations
  createSectorUpdateHistory(history: InsertSectorUpdateHistory): Promise<SectorUpdateHistory>;
  getSectorUpdateHistory(id: string): Promise<SectorUpdateHistory | undefined>;
  getAllSectorUpdateHistory(limit?: number): Promise<SectorUpdateHistory[]>;
  updateSectorUpdateHistory(id: string, data: Partial<InsertSectorUpdateHistory>): Promise<SectorUpdateHistory | undefined>;

  // Scheduler Settings operations
  getSchedulerSetting(jobType: string): Promise<SchedulerSettings | undefined>;
  getAllSchedulerSettings(): Promise<SchedulerSettings[]>;
  upsertSchedulerSetting(setting: InsertSchedulerSettings): Promise<SchedulerSettings>;

  // Sector Schedule operations
  getSectorSchedule(sectorId: string): Promise<SectorSchedule | undefined>;
  getAllSectorSchedules(): Promise<SectorSchedule[]>;
  getSectorSchedulesBySector(sectorId: string): Promise<SectorSchedule[]>;
  upsertSectorSchedule(schedule: InsertSectorSchedule): Promise<SectorSchedule>;
  deleteSectorSchedule(id: string): Promise<void>;
}

export class DbStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getAdminUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, "admin"));
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Session operations
  async createSession(userId: string): Promise<Session> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const result = await db.insert(sessions).values({ userId, token, expiresAt }).returning();
    return result[0];
  }

  async getSession(token: string): Promise<Session | undefined> {
    const result = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
    return result[0];
  }

  async deleteSession(token: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  // Sector operations
  async getSector(id: string): Promise<Sector | undefined> {
    const result = await db.select().from(sectors).where(eq(sectors.id, id)).limit(1);
    return result[0];
  }

  async getSectorByName(name: string): Promise<Sector | undefined> {
    const result = await db.select().from(sectors).where(eq(sectors.name, name)).limit(1);
    return result[0];
  }

  async getAllSectors(): Promise<Sector[]> {
    return await db.select().from(sectors);
  }

  async createSector(sector: InsertSector): Promise<Sector> {
    const result = await db.insert(sectors).values(sector).returning();
    return result[0];
  }

  async updateSector(id: string, data: Partial<InsertSector>): Promise<Sector | undefined> {
    const result = await db.update(sectors).set(data).where(eq(sectors.id, id)).returning();
    return result[0];
  }

  async deleteSector(id: string): Promise<void> {
    // Check if there are companies using this sector
    const companiesInSector = await db
      .select({ count: sql<number>`count(*)` })
      .from(companies)
      .where(eq(companies.sectorId, id));
    
    const companyCount = Number(companiesInSector[0]?.count || 0);
    
    if (companyCount > 0) {
      throw new Error(
        `Cannot delete sector: ${companyCount} ${companyCount === 1 ? 'company is' : 'companies are'} still assigned to this sector. Please reassign or remove these companies first.`
      );
    }
    
    await db.delete(sectors).where(eq(sectors.id, id));
  }

  // Company operations
  async getCompany(id: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    return result[0];
  }

  async getCompanyByTicker(ticker: string): Promise<Company | undefined> {
    const result = await db.select().from(companies).where(eq(companies.ticker, ticker)).limit(1);
    return result[0];
  }

  async getCompanyByTickerAndSector(ticker: string, sectorId: string): Promise<Company | undefined> {
    const result = await db.select().from(companies)
      .where(and(eq(companies.ticker, ticker), eq(companies.sectorId, sectorId)))
      .limit(1);
    return result[0];
  }

  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies);
  }

  async getCompaniesBySector(sectorId: string): Promise<Company[]> {
    return await db.select().from(companies).where(eq(companies.sectorId, sectorId));
  }

  async getCompaniesBySectorAndMarketCap(sectorId: string, minCap?: number, maxCap?: number): Promise<Company[]> {
    const conditions = [eq(companies.sectorId, sectorId)];

    if (minCap !== undefined) {
      conditions.push(gte(companies.marketCap, minCap.toString()));
    }

    if (maxCap !== undefined) {
      conditions.push(lte(companies.marketCap, maxCap.toString()));
    }

    return await db.select().from(companies).where(and(...conditions));
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const result = await db.insert(companies).values(company).returning();
    return result[0];
  }

  async bulkCreateCompanies(companiesData: InsertCompany[]): Promise<Company[]> {
    if (companiesData.length === 0) return [];
    const result = await db.insert(companies).values(companiesData).returning();
    return result;
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const result = await db.update(companies).set({ ...data, updatedAt: new Date() }).where(eq(companies.id, id)).returning();
    return result[0];
  }

  async deleteCompany(id: string): Promise<void> {
    // Delete all related records first to avoid foreign key constraint violations
    await db.transaction(async (tx) => {
      // Delete signals
      await tx.delete(signals).where(eq(signals.companyId, id));

      // Delete quarterly data
      await tx.delete(quarterlyData).where(eq(quarterlyData.companyId, id));

      // Delete scraping logs
      await tx.delete(scrapingLogs).where(eq(scrapingLogs.companyId, id));

      // Delete custom tables
      await tx.delete(customTables).where(eq(customTables.companyId, id));

      // Finally delete the company
      await tx.delete(companies).where(eq(companies.id, id));
    });
  }

  async bulkDeleteCompanies(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    // Delete all related records first to avoid foreign key constraint violations
    await db.transaction(async (tx) => {
      // Delete signals for all companies
      await tx.delete(signals).where(inArray(signals.companyId, ids));

      // Delete quarterly data for all companies
      await tx.delete(quarterlyData).where(inArray(quarterlyData.companyId, ids));

      // Delete scraping logs for all companies
      await tx.delete(scrapingLogs).where(inArray(scrapingLogs.companyId, ids));

      // Delete custom tables for all companies
      await tx.delete(customTables).where(inArray(customTables.companyId, ids));

      // Finally delete the companies
      await tx.delete(companies).where(inArray(companies.id, ids));
    });
  }

  // Formula operations
  async getFormula(id: string): Promise<Formula | undefined> {
    const result = await db.select().from(formulas).where(eq(formulas.id, id)).limit(1);
    return result[0];
  }

  async getAllFormulas(): Promise<Formula[]> {
    return await db.select().from(formulas).orderBy(formulas.priority, formulas.name);
  }

  async getFormulasByScope(scope: string): Promise<Formula[]> {
    return await db.select().from(formulas).where(eq(formulas.scope, scope)).orderBy(formulas.priority, formulas.name);
  }

  async createFormula(formula: InsertFormula): Promise<Formula> {
    const result = await db.insert(formulas).values(formula).returning();
    return result[0];
  }

  async updateFormula(id: string, data: Partial<InsertFormula>): Promise<Formula | undefined> {
    const result = await db.update(formulas).set({ ...data, updatedAt: new Date() }).where(eq(formulas.id, id)).returning();
    return result[0];
  }

  async deleteFormula(id: string): Promise<void> {
    await db.delete(formulas).where(eq(formulas.id, id));
  }

  // Query operations
  async getQuery(id: string): Promise<Query | undefined> {
    const result = await db.select().from(queries).where(eq(queries.id, id)).limit(1);
    return result[0];
  }

  async getAllQueries(): Promise<Query[]> {
    return await db.select().from(queries).orderBy(desc(queries.createdAt));
  }

  async getQueriesByUser(userId: string): Promise<Query[]> {
    return await db.select().from(queries).where(eq(queries.createdBy, userId)).orderBy(desc(queries.createdAt));
  }

  async createQuery(query: InsertQuery): Promise<Query> {
    const result = await db.insert(queries).values(query).returning();
    return result[0];
  }

  async updateQuery(id: string, data: Partial<InsertQuery>): Promise<Query | undefined> {
    const result = await db.update(queries).set({ ...data, updatedAt: new Date() }).where(eq(queries.id, id)).returning();
    return result[0];
  }

  async deleteQuery(id: string): Promise<void> {
    await db.delete(queries).where(eq(queries.id, id));
  }

  // Signal operations
  async getSignal(id: string): Promise<Signal | undefined> {
    const result = await db.select().from(signals).where(eq(signals.id, id)).limit(1);
    return result[0];
  }

  async getSignalsByCompany(companyId: string): Promise<Signal[]> {
    return await db.select().from(signals).where(eq(signals.companyId, companyId)).orderBy(desc(signals.createdAt));
  }

  async getSignalsByFormula(formulaId: string): Promise<Signal[]> {
    return await db.select().from(signals).where(eq(signals.formulaId, formulaId)).orderBy(desc(signals.createdAt));
  }

  async getAllSignals(): Promise<Signal[]> {
    return await db.select().from(signals).orderBy(desc(signals.createdAt));
  }

  async createSignal(signal: InsertSignal): Promise<Signal> {
    const result = await db.insert(signals).values(signal).returning();
    return result[0];
  }

  async deleteSignal(id: string): Promise<void> {
    await db.delete(signals).where(eq(signals.id, id));
  }

  async deleteSignalsByCompany(companyId: string): Promise<void> {
    await db.delete(signals).where(eq(signals.companyId, companyId));
  }

  async getStaleSignalCount(): Promise<number> {
    const { companies: companiesTable } = await import("@shared/schema");
    
    // Count companies where company.updatedAt > signal.updatedAt or no signal exists
    const result = await db
      .select({ count: sql<number>`count(distinct ${companiesTable.id})` })
      .from(companiesTable)
      .leftJoin(signals, eq(companiesTable.id, signals.companyId))
      .where(
        or(
          isNull(signals.id),
          lt(signals.updatedAt, companiesTable.updatedAt)
        )
      );
    
    return result[0]?.count || 0;
  }

  async getSignalStatistics(): Promise<{
    totalSignals: number;
    staleSignals: number;
    lastCalculationTime: Date | null;
    signalsByType: { signal: string; count: number }[];
  }> {
    const { companies: companiesTable } = await import("@shared/schema");
    
    // Get total signals count
    const totalSignalsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(signals);
    const totalSignals = Number(totalSignalsResult[0]?.count || 0);

    // Get stale signals count
    const staleSignals = await this.getStaleSignalCount();

    // Get last calculation time (max updatedAt from signals)
    const lastCalcResult = await db
      .select({ maxUpdatedAt: max(signals.updatedAt) })
      .from(signals);
    const lastCalculationTime = lastCalcResult[0]?.maxUpdatedAt 
      ? new Date(lastCalcResult[0].maxUpdatedAt) 
      : null;

    // Get signals by type
    const signalsByTypeResult = await db
      .select({
        signal: signals.signal,
        count: sql<number>`count(*)`,
      })
      .from(signals)
      .groupBy(signals.signal);
    
    const signalsByType = signalsByTypeResult.map(row => ({
      signal: row.signal,
      count: Number(row.count),
    }));

    return {
      totalSignals,
      staleSignals,
      lastCalculationTime,
      signalsByType,
    };
  }

  async getSignalDistribution(): Promise<{ signal: string; count: number }[]> {
    // Group signals by their exact value, ignoring blank strings
    const results = await db
      .select({
        signal: signals.signal,
        count: sql<number>`count(*)`,
      })
      .from(signals)
      .where(sql`trim(${signals.signal}) <> ''`)
      .groupBy(signals.signal)
      .orderBy(desc(sql<number>`count(*)`), desc(signals.signal));

    return results.map((row) => ({
      signal: row.signal,
      count: Number(row.count),
    }));
  }

  // OTP operations
  async createOtpCode(otp: InsertOtpCode): Promise<OtpCode> {
    const result = await db.insert(otpCodes).values(otp).returning();
    return result[0];
  }

  async getOtpCode(phone: string, code: string): Promise<OtpCode | undefined> {
    const result = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), eq(otpCodes.code, code), eq(otpCodes.used, false)))
      .limit(1);
    return result[0];
  }

  async markOtpCodeAsUsed(id: string): Promise<void> {
    await db.update(otpCodes).set({ used: true }).where(eq(otpCodes.id, id));
  }

  async deleteExpiredOtpCodes(): Promise<void> {
    await db.delete(otpCodes).where(eq(otpCodes.expiresAt, new Date()));
  }

  // Role Permissions operations
  async getRolePermissions(role: string): Promise<RolePermission | undefined> {
    const result = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.role, role))
      .limit(1);
    return result[0];
  }

  async getAllRolePermissions(): Promise<RolePermission[]> {
    return await db.select().from(rolePermissions);
  }

  async upsertRolePermissions(role: string, permissions: any): Promise<RolePermission> {
    const existing = await this.getRolePermissions(role);

    if (existing) {
      const result = await db
        .update(rolePermissions)
        .set({ permissions, updatedAt: new Date() })
        .where(eq(rolePermissions.role, role))
        .returning();
      return result[0];
    } else {
      const result = await db
        .insert(rolePermissions)
        .values({ role, permissions })
        .returning();
      return result[0];
    }
  }

  // Quarterly Data operations
  async getQuarterlyDataByTicker(ticker: string): Promise<QuarterlyData[]> {
    return await db
      .select()
      .from(quarterlyData)
      .where(eq(quarterlyData.ticker, ticker))
      .orderBy(desc(quarterlyData.quarter), desc(quarterlyData.scrapeTimestamp));
  }

  async getQuarterlyDataByCompany(companyId: string): Promise<QuarterlyData[]> {
    return await db
      .select()
      .from(quarterlyData)
      .where(eq(quarterlyData.companyId, companyId))
      .orderBy(desc(quarterlyData.quarter), desc(quarterlyData.scrapeTimestamp));
  }

  async getQuarterlyDataBySector(sectorId: string): Promise<QuarterlyData[]> {
    // First get all company IDs in this sector
    const sectorCompanies = await db
      .select({ id: companies.id, ticker: companies.ticker })
      .from(companies)
      .where(eq(companies.sectorId, sectorId));

    if (sectorCompanies.length === 0) {
      return [];
    }

    const companyIds = sectorCompanies.map(c => c.id);

    // Then get quarterly data for those companies
    return await db
      .select()
      .from(quarterlyData)
      .where(inArray(quarterlyData.companyId, companyIds))
      .orderBy(desc(quarterlyData.quarter), desc(quarterlyData.scrapeTimestamp));
  }

  async createQuarterlyData(data: InsertQuarterlyData): Promise<QuarterlyData> {
    const result = await db.insert(quarterlyData).values(data).returning();
    return result[0];
  }

  async bulkCreateQuarterlyData(data: InsertQuarterlyData[]): Promise<QuarterlyData[]> {
    if (data.length === 0) return [];

    // Use ON CONFLICT to handle duplicates
    const result = await db
      .insert(quarterlyData)
      .values(data)
      .onConflictDoUpdate({
        target: [quarterlyData.ticker, quarterlyData.quarter, quarterlyData.metricName, quarterlyData.scrapeTimestamp],
        set: {
          metricValue: sql`EXCLUDED.metric_value`,
          companyId: sql`EXCLUDED.company_id`,
        }
      })
      .returning();
    return result;
  }

  async deleteQuarterlyDataByTicker(ticker: string): Promise<void> {
    await db.delete(quarterlyData).where(eq(quarterlyData.ticker, ticker));
  }

  // Custom Table operations
  async getCustomTable(id: string): Promise<CustomTable | undefined> {
    const result = await db.select().from(customTables).where(eq(customTables.id, id)).limit(1);
    return result[0];
  }

  async getAllCustomTables(): Promise<CustomTable[]> {
    return await db.select().from(customTables).orderBy(desc(customTables.createdAt));
  }

  async getCustomTablesByUser(userId: string): Promise<CustomTable[]> {
    return await db
      .select()
      .from(customTables)
      .where(eq(customTables.createdBy, userId))
      .orderBy(desc(customTables.createdAt));
  }

  async getCustomTablesByType(tableType: string): Promise<CustomTable[]> {
    return await db
      .select()
      .from(customTables)
      .where(eq(customTables.tableType, tableType))
      .orderBy(desc(customTables.createdAt));
  }

  async getCustomTablesBySector(sectorId: string): Promise<CustomTable[]> {
    return await db
      .select()
      .from(customTables)
      .where(eq(customTables.sectorId, sectorId))
      .orderBy(desc(customTables.createdAt));
  }

  async getCustomTablesByCompany(companyId: string): Promise<CustomTable[]> {
    return await db
      .select()
      .from(customTables)
      .where(eq(customTables.companyId, companyId))
      .orderBy(desc(customTables.createdAt));
  }

  async createCustomTable(table: InsertCustomTable): Promise<CustomTable> {
    const result = await db.insert(customTables).values(table).returning();
    return result[0];
  }

  async updateCustomTable(id: string, data: Partial<InsertCustomTable>): Promise<CustomTable | undefined> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };
    const result = await db
      .update(customTables)
      .set(updateData)
      .where(eq(customTables.id, id))
      .returning();
    return result[0];
  }

  async deleteCustomTable(id: string): Promise<void> {
    await db.delete(customTables).where(eq(customTables.id, id));
  }

  // Sector Mapping operations
  async getSectorMappingsByCustomSector(sectorId: string): Promise<SectorMapping[]> {
    return await db
      .select()
      .from(sectorMappings)
      .where(eq(sectorMappings.customSectorId, sectorId))
      .orderBy(sectorMappings.createdAt);
  }

  async getSectorMappingsByScreenerSector(screenerSector: string): Promise<SectorMapping[]> {
    return await db
      .select()
      .from(sectorMappings)
      .where(eq(sectorMappings.screenerSector, screenerSector));
  }

  async getScreenerSectorsForCustomSector(sectorId: string): Promise<string[]> {
    const mappings = await this.getSectorMappingsByCustomSector(sectorId);
    return mappings.map(m => m.screenerSector);
  }

  async createSectorMapping(mapping: InsertSectorMapping): Promise<SectorMapping> {
    const result = await db.insert(sectorMappings).values(mapping).returning();
    return result[0];
  }

  async deleteSectorMapping(id: string): Promise<void> {
    await db.delete(sectorMappings).where(eq(sectorMappings.id, id));
  }

  // Scraping Log operations
  async createScrapingLog(log: InsertScrapingLog): Promise<ScrapingLog> {
    const result = await db.insert(scrapingLogs).values(log).returning();
    return result[0];
  }

  async getScrapingLogsByCompany(companyId: string): Promise<ScrapingLog[]> {
    return await db
      .select()
      .from(scrapingLogs)
      .where(eq(scrapingLogs.companyId, companyId))
      .orderBy(desc(scrapingLogs.startedAt));
  }

  async getScrapingLogsByTicker(ticker: string): Promise<ScrapingLog[]> {
    return await db
      .select()
      .from(scrapingLogs)
      .where(eq(scrapingLogs.ticker, ticker))
      .orderBy(desc(scrapingLogs.startedAt));
  }

  async getLastScrapeTime(ticker: string): Promise<Date | null> {
    const logs = await db
      .select()
      .from(scrapingLogs)
      .where(and(
        eq(scrapingLogs.ticker, ticker),
        eq(scrapingLogs.status, 'success')
      ))
      .orderBy(desc(scrapingLogs.completedAt))
      .limit(1);

    return logs[0]?.completedAt || null;
  }

  async getScrapingLogs(filters?: { companyId?: string; sectorId?: string; status?: string; limit?: number }): Promise<ScrapingLog[]> {
    let query = db.select().from(scrapingLogs);

    const conditions = [];
    if (filters?.companyId) {
      conditions.push(eq(scrapingLogs.companyId, filters.companyId));
    }
    if (filters?.sectorId) {
      conditions.push(eq(scrapingLogs.sectorId, filters.sectorId));
    }
    if (filters?.status) {
      conditions.push(eq(scrapingLogs.status, filters.status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Order by completedAt DESC (nulls last), then startedAt DESC
    // For most recent activity, we want completed logs first
    query = query.orderBy(desc(scrapingLogs.completedAt), desc(scrapingLogs.startedAt)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    return await query;
  }

  async updateScrapingLog(id: string, data: Partial<InsertScrapingLog>): Promise<ScrapingLog | undefined> {
    const result = await db
      .update(scrapingLogs)
      .set(data)
      .where(eq(scrapingLogs.id, id))
      .returning();
    return result[0];
  }

  async deleteScrapingLog(id: string): Promise<void> {
    await db.delete(scrapingLogs).where(eq(scrapingLogs.id, id));
  }

  // Sector Update History operations
  async createSectorUpdateHistory(history: InsertSectorUpdateHistory): Promise<SectorUpdateHistory> {
    const result = await db.insert(sectorUpdateHistory).values(history).returning();
    return result[0];
  }

  async getSectorUpdateHistory(id: string): Promise<SectorUpdateHistory | undefined> {
    const result = await db.select().from(sectorUpdateHistory).where(eq(sectorUpdateHistory.id, id)).limit(1);
    return result[0];
  }

  async getAllSectorUpdateHistory(limit: number = 50): Promise<SectorUpdateHistory[]> {
    return await db
      .select()
      .from(sectorUpdateHistory)
      .orderBy(desc(sectorUpdateHistory.startedAt))
      .limit(limit);
  }

  async updateSectorUpdateHistory(id: string, data: Partial<InsertSectorUpdateHistory>): Promise<SectorUpdateHistory | undefined> {
    const result = await db
      .update(sectorUpdateHistory)
      .set(data)
      .where(eq(sectorUpdateHistory.id, id))
      .returning();
    return result[0];
  }

  // Bulk Import Job operations
  async createBulkImportJob(job: InsertBulkImportJob): Promise<BulkImportJob> {
    const result = await db.insert(bulkImportJobs).values(job).returning();
    return result[0];
  }

  async getBulkImportJob(id: string): Promise<BulkImportJob | undefined> {
    const result = await db.select().from(bulkImportJobs).where(eq(bulkImportJobs.id, id)).limit(1);
    return result[0];
  }

  async getAllBulkImportJobs(userId?: string, limit: number = 50): Promise<BulkImportJob[]> {
    let query = db.select().from(bulkImportJobs);
    
    if (userId) {
      query = query.where(eq(bulkImportJobs.userId, userId)) as any;
    }
    
    return await query.orderBy(desc(bulkImportJobs.createdAt)).limit(limit);
  }

  async updateBulkImportJob(id: string, data: Partial<InsertBulkImportJob>): Promise<BulkImportJob | undefined> {
    const result = await db
      .update(bulkImportJobs)
      .set(data)
      .where(eq(bulkImportJobs.id, id))
      .returning();
    return result[0];
  }

  async deleteBulkImportJob(id: string): Promise<void> {
    // Items will be deleted by cascade
    await db.delete(bulkImportJobs).where(eq(bulkImportJobs.id, id));
  }

  // Bulk Import Item operations
  async createBulkImportItem(item: InsertBulkImportItem): Promise<BulkImportItem> {
    const result = await db.insert(bulkImportItems).values(item).returning();
    return result[0];
  }

  async bulkCreateBulkImportItems(items: InsertBulkImportItem[]): Promise<BulkImportItem[]> {
    if (items.length === 0) return [];
    const result = await db.insert(bulkImportItems).values(items).returning();
    return result;
  }

  async getBulkImportItemsByJob(jobId: string): Promise<BulkImportItem[]> {
    return await db.select().from(bulkImportItems)
      .where(eq(bulkImportItems.jobId, jobId))
      .orderBy(bulkImportItems.createdAt);
  }

  async getBulkImportItemsByStatus(jobId: string, status: string): Promise<BulkImportItem[]> {
    return await db.select().from(bulkImportItems)
      .where(and(
        eq(bulkImportItems.jobId, jobId),
        eq(bulkImportItems.status, status)
      ))
      .orderBy(bulkImportItems.createdAt);
  }

  async getNextPendingBulkImportItem(jobId: string): Promise<BulkImportItem | undefined> {
    const result = await db.select().from(bulkImportItems)
      .where(and(
        eq(bulkImportItems.jobId, jobId),
        eq(bulkImportItems.status, 'pending')
      ))
      .orderBy(bulkImportItems.createdAt)
      .limit(1);
    return result[0];
  }

  async updateBulkImportItem(id: string, data: Partial<InsertBulkImportItem>): Promise<BulkImportItem | undefined> {
    const result = await db
      .update(bulkImportItems)
      .set(data)
      .where(eq(bulkImportItems.id, id))
      .returning();
    return result[0];
  }

  async getBulkImportStats(jobId: string): Promise<{ pending: number; processing: number; success: number; failed: number; skipped: number }> {
    const items = await db.select().from(bulkImportItems).where(eq(bulkImportItems.jobId, jobId));
    return {
      pending: items.filter(i => i.status === 'pending').length,
      processing: items.filter(i => i.status === 'processing').length,
      success: items.filter(i => i.status === 'success').length,
      failed: items.filter(i => i.status === 'failed').length,
      skipped: items.filter(i => i.status === 'skipped').length,
    };
  }

  // Scheduler Settings operations
  async getSchedulerSetting(jobType: string): Promise<SchedulerSettings | undefined> {
    const result = await db.select().from(schedulerSettings).where(eq(schedulerSettings.jobType, jobType)).limit(1);
    return result[0];
  }

  async getAllSchedulerSettings(): Promise<SchedulerSettings[]> {
    return await db.select().from(schedulerSettings).orderBy(schedulerSettings.jobType);
  }

  async upsertSchedulerSetting(setting: InsertSchedulerSettings): Promise<SchedulerSettings> {
    const existing = await this.getSchedulerSetting(setting.jobType);
    
    if (existing) {
      const result = await db
        .update(schedulerSettings)
        .set({
          ...setting,
          updatedAt: new Date(),
        })
        .where(eq(schedulerSettings.jobType, setting.jobType))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(schedulerSettings).values(setting).returning();
      return result[0];
    }
  }

  // Sector Schedule operations
  async getSectorSchedule(sectorId: string): Promise<SectorSchedule | undefined> {
    const result = await db.select().from(sectorSchedules).where(eq(sectorSchedules.sectorId, sectorId)).limit(1);
    return result[0];
  }

  async getAllSectorSchedules(): Promise<SectorSchedule[]> {
    return await db.select().from(sectorSchedules).orderBy(sectorSchedules.sectorId);
  }

  async getSectorSchedulesBySector(sectorId: string): Promise<SectorSchedule[]> {
    return await db.select().from(sectorSchedules).where(eq(sectorSchedules.sectorId, sectorId));
  }

  async upsertSectorSchedule(schedule: InsertSectorSchedule): Promise<SectorSchedule> {
    const existing = await this.getSectorSchedule(schedule.sectorId);
    
    if (existing) {
      const result = await db
        .update(sectorSchedules)
        .set({
          ...schedule,
          updatedAt: new Date(),
        })
        .where(eq(sectorSchedules.sectorId, schedule.sectorId))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(sectorSchedules).values(schedule).returning();
      return result[0];
    }
  }

  async deleteSectorSchedule(id: string): Promise<void> {
    await db.delete(sectorSchedules).where(eq(sectorSchedules.id, id));
  }
}

export const storage = new DbStorage();
