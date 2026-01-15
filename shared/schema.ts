import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, decimal, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  permissions: jsonb("permissions").notNull().default([]),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("viewer"),
  otpSecret: text("otp_secret").default(sql`NULL`),
  otpEnabled: boolean("otp_enabled").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const otpCodes = pgTable("otp_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sectors = pgTable("sectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  assignedFormulaId: varchar("assigned_formula_id"), // Reference to formulas.id - applied to all companies in sector unless overridden
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticker: text("ticker").notNull(),
  name: text("name").notNull(),
  sectorId: varchar("sector_id").notNull().references(() => sectors.id),
  assignedFormulaId: varchar("assigned_formula_id"), // Reference to formulas.id - overrides sector/global formula for this company
  marketCap: decimal("market_cap", { precision: 20, scale: 2 }),
  financialData: jsonb("financial_data"),
  preferredDataSource: text("preferred_data_source").default("consolidated"), // 'consolidated' or 'standalone' - user's preferred data source for quarterly data
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueTickerSector: unique().on(table.ticker, table.sectorId),
}));

export const formulas = pgTable("formulas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  scope: text("scope").notNull().default("global"),
  scopeValue: text("scope_value"),
  condition: text("condition").notNull(),
  signal: text("signal").notNull(),
  priority: integer("priority").notNull().default(999),
  enabled: boolean("enabled").notNull().default(true),
  formulaType: text("formula_type").default("simple"), // 'simple' | 'excel' - Excel formulas use Q12-Q16, P12-P16
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const queries = pgTable("queries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  criteria: jsonb("criteria").notNull(),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  formulaId: varchar("formula_id").notNull().references(() => formulas.id),
  signal: text("signal").notNull(),
  value: decimal("value", { precision: 10, scale: 4 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const quarterlyData = pgTable("quarterly_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticker: text("ticker").notNull(),
  companyId: varchar("company_id").references(() => companies.id),
  quarter: text("quarter").notNull(),
  metricName: text("metric_name").notNull(),
  metricValue: decimal("metric_value", { precision: 20, scale: 4 }),
  scrapeTimestamp: timestamp("scrape_timestamp"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueTickerQuarterMetric: unique().on(table.ticker, table.quarter, table.metricName, table.scrapeTimestamp),
}));

export const customTables = pgTable("custom_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  tableType: text("table_type").notNull(), // 'sector', 'company', 'global'
  sectorId: varchar("sector_id").references(() => sectors.id),
  companyId: varchar("company_id").references(() => companies.id),
  columns: jsonb("columns"),
  data: jsonb("data"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});



export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role: text("role").notNull().unique(),
  permissions: jsonb("permissions").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sectorMappings = pgTable("sector_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  screenerSector: text("screener_sector").notNull(),
  customSectorId: varchar("custom_sector_id").notNull().references(() => sectors.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueScreenerSectorCustomSector: unique().on(table.screenerSector, table.customSectorId),
}));

export const scrapingLogs = pgTable("scraping_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticker: text("ticker").notNull(),
  companyId: varchar("company_id").references(() => companies.id),
  sectorId: varchar("sector_id").references(() => sectors.id),
  userId: varchar("user_id").references(() => users.id), // Track who triggered the scrape
  status: text("status").notNull(), // 'success' | 'failed'
  quartersScraped: integer("quarters_scraped").default(0),
  metricsScraped: integer("metrics_scraped").default(0),
  error: text("error"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sectorUpdateHistory = pgTable("sector_update_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(), // Who triggered the update
  status: text("status").notNull(), // 'pending' | 'running' | 'completed' | 'failed'
  progress: integer("progress").default(0), // 0-100
  totalSectors: integer("total_sectors").notNull(),
  completedSectors: integer("completed_sectors").default(0),
  successfulSectors: integer("successful_sectors").default(0),
  failedSectors: integer("failed_sectors").default(0),
  sectorResults: jsonb("sector_results").$type<Array<{
    sectorId: string;
    sectorName: string;
    status: 'success' | 'error';
    error?: string;
    companiesUpdated?: number;
  }>>().default([]),
  error: text("error"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
});

export const insertSectorSchema = createInsertSchema(sectors).omit({
  id: true,
  createdAt: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFormulaSchema = createInsertSchema(formulas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuerySchema = createInsertSchema(queries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomTableSchema = createInsertSchema(customTables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

export type InsertSector = z.infer<typeof insertSectorSchema>;
export type Sector = typeof sectors.$inferSelect;

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

export type InsertFormula = z.infer<typeof insertFormulaSchema>;
export type Formula = typeof formulas.$inferSelect;

export type InsertQuery = z.infer<typeof insertQuerySchema>;
export type Query = typeof queries.$inferSelect;

export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signals.$inferSelect;

export type Session = typeof sessions.$inferSelect;

export type QuarterlyData = typeof quarterlyData.$inferSelect;
export type InsertQuarterlyData = typeof quarterlyData.$inferInsert;

export type CustomTable = typeof customTables.$inferSelect;
export type InsertCustomTable = typeof customTables.$inferInsert;

export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertOtpCode = typeof otpCodes.$inferInsert;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = typeof rolePermissions.$inferInsert;

export type SectorMapping = typeof sectorMappings.$inferSelect;
export type InsertSectorMapping = typeof sectorMappings.$inferInsert;

export type ScrapingLog = typeof scrapingLogs.$inferSelect;
export type InsertScrapingLog = typeof scrapingLogs.$inferInsert;

export type SectorUpdateHistory = typeof sectorUpdateHistory.$inferSelect;
export type InsertSectorUpdateHistory = typeof sectorUpdateHistory.$inferInsert;

// Bulk Import Jobs - tracks overall import job
export const bulkImportJobs = pgTable("bulk_import_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  fileName: text("file_name").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  totalItems: integer("total_items").notNull().default(0),
  processedItems: integer("processed_items").notNull().default(0),
  successItems: integer("success_items").notNull().default(0),
  failedItems: integer("failed_items").notNull().default(0),
  skippedItems: integer("skipped_items").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Bulk Import Items - tracks each company in the job
export const bulkImportItems = pgTable("bulk_import_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => bulkImportJobs.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  sectorName: text("sector_name").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'success' | 'failed' | 'skipped'
  resolvedTicker: text("resolved_ticker"), // Actual ticker from Screener.in search
  sectorId: varchar("sector_id").references(() => sectors.id),
  companyId: varchar("company_id").references(() => companies.id),
  error: text("error"),
  quartersScraped: integer("quarters_scraped").default(0),
  metricsScraped: integer("metrics_scraped").default(0),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBulkImportJobSchema = createInsertSchema(bulkImportJobs).omit({
  id: true,
  createdAt: true,
});

export const insertBulkImportItemSchema = createInsertSchema(bulkImportItems).omit({
  id: true,
  createdAt: true,
});

export type BulkImportJob = typeof bulkImportJobs.$inferSelect;
export type InsertBulkImportJob = z.infer<typeof insertBulkImportJobSchema>;

export type BulkImportItem = typeof bulkImportItems.$inferSelect;
export type InsertBulkImportItem = z.infer<typeof insertBulkImportItemSchema>;

// Scheduler Settings - stores configurable schedule times
export const schedulerSettings = pgTable("scheduler_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: text("job_type").notNull().unique(), // 'daily-scraping', 'signal-incremental', 'signal-full'
  schedule: text("schedule").notNull(), // Cron expression
  enabled: boolean("enabled").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSchedulerSettingsSchema = createInsertSchema(schedulerSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SchedulerSettings = typeof schedulerSettings.$inferSelect;
export type InsertSchedulerSettings = z.infer<typeof insertSchedulerSettingsSchema>;

// Sector-Specific Schedules - allows scheduling scraping for individual sectors
export const sectorSchedules = pgTable("sector_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectorId: varchar("sector_id").notNull().references(() => sectors.id, { onDelete: "cascade" }),
  schedule: text("schedule").notNull(), // Cron expression
  enabled: boolean("enabled").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSectorScheduleSchema = createInsertSchema(sectorSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SectorSchedule = typeof sectorSchedules.$inferSelect;
export type InsertSectorSchedule = z.infer<typeof insertSectorScheduleSchema>;

// Application Settings - stores application-wide settings like default metrics
export const appSettings = pgTable("app_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., 'default_metrics'
  value: jsonb("value").notNull(), // JSON value for the setting
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
