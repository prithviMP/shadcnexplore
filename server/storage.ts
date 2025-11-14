import { db } from "./db";
import { 
  users, 
  sectors, 
  companies, 
  formulas, 
  queries, 
  signals,
  sessions,
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
  type Session
} from "@shared/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  // Session operations
  createSession(userId: string): Promise<Session>;
  getSession(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;

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
  getAllCompanies(): Promise<Company[]>;
  getCompaniesBySector(sectorId: string): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<void>;

  // Formula operations
  getFormula(id: string): Promise<Formula | undefined>;
  getAllFormulas(): Promise<Formula[]>;
  getFormulasByLevel(level: number): Promise<Formula[]>;
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

  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies);
  }

  async getCompaniesBySector(sectorId: string): Promise<Company[]> {
    return await db.select().from(companies).where(eq(companies.sectorId, sectorId));
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const result = await db.insert(companies).values(company).returning();
    return result[0];
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const result = await db.update(companies).set({ ...data, updatedAt: new Date() }).where(eq(companies.id, id)).returning();
    return result[0];
  }

  async deleteCompany(id: string): Promise<void> {
    await db.delete(companies).where(eq(companies.id, id));
  }

  // Formula operations
  async getFormula(id: string): Promise<Formula | undefined> {
    const result = await db.select().from(formulas).where(eq(formulas.id, id)).limit(1);
    return result[0];
  }

  async getAllFormulas(): Promise<Formula[]> {
    return await db.select().from(formulas).orderBy(formulas.level, formulas.name);
  }

  async getFormulasByLevel(level: number): Promise<Formula[]> {
    return await db.select().from(formulas).where(eq(formulas.level, level));
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
}

export const storage = new DbStorage();
