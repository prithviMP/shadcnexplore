import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  hashPassword,
  verifyPassword,
  createUserSession,
  deleteUserSession,
  generateOTPSecret,
  verifyOTP,
  generateOTPAuthURL,
  createAndSendOtp,
  verifyOtpCode
} from "./auth";
import { requireAuth, requireRole, requirePermission, requireAnyPermission, type AuthRequest } from "./middleware";
import { sanitizeUser } from "./utils";
import {
  insertUserSchema,
  insertSectorSchema,
  insertCompanySchema,
  insertFormulaSchema,
  insertQuerySchema,
  insertSignalSchema,
  insertCustomTableSchema,
  users,
  quarterlyData,
  type InsertSectorMapping
} from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { queryExecutor, type QueryCondition } from "./queryExecutor";
import { FormulaEvaluator } from "./formulaEvaluator";
import { scraper } from "./scraper";
import { excelQueryParser } from "./excelQueryParser";
import { sendWelcomeEmail, sendAdminNotificationEmail } from "./email";
import { taskManager } from "./taskManager";
import { evaluateMainSignalForCompany } from "./mainSignalEvaluator";
import { evaluateExcelFormulaForCompany, ExcelFormulaEvaluator } from "./excelFormulaEvaluator";
import { loadVisibleMetrics, saveVisibleMetrics, getAllMetrics, getVisibleMetrics } from "./settingsManager";

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);

      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ error: "Email already exists" });
      }

      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
        role: data.role || "viewer"
      });

      const token = await createUserSession(user.id);
      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      res.json({ user: sanitizeUser(user), token });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password, otpToken } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check if user is enabled
      if (user.enabled === false) {
        return res.status(403).json({ error: "Account is disabled. Please contact an administrator." });
      }

      const validPassword = await verifyPassword(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (user.otpEnabled) {
        if (!otpToken) {
          return res.json({ requiresOTP: true });
        }

        if (!user.otpSecret || !verifyOTP(otpToken, user.otpSecret)) {
          return res.status(401).json({ error: "Invalid OTP token" });
        }
      }

      const token = await createUserSession(user.id);
      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      res.json({ user: sanitizeUser(user), token });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: AuthRequest, res) => {
    try {
      const token = req.cookies?.auth_token || req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        await deleteUserSession(token);
      }
      res.clearCookie("auth_token");
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    res.json({ user: sanitizeUser(req.user!) });
  });

  app.post("/api/auth/otp/setup", requireAuth, async (req: AuthRequest, res) => {
    try {
      const secret = generateOTPSecret();
      await storage.updateUser(req.user!.id, { otpSecret: secret });
      const otpauthUrl = generateOTPAuthURL(req.user!.email, secret);
      res.json({ otpauthUrl });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/otp/enable", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { token } = req.body;
      const user = req.user!;

      if (!user.otpSecret || !verifyOTP(token, user.otpSecret)) {
        return res.status(400).json({ error: "Invalid OTP token" });
      }

      await storage.updateUser(user.id, { otpEnabled: true });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/otp/disable", requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await db.update(users).set({
        otpEnabled: false,
        otpSecret: null
      }).where(eq(users.id, req.user!.id)).returning();
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Mobile OTP login endpoints
  app.post("/api/auth/login/otp/request", async (req, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Check if user exists with this phone number
      // Note: You may need to add phone field to users table or use a separate mapping
      // For now, we'll allow OTP to be sent to any phone number
      // In production, you should verify the phone belongs to a registered user

      await createAndSendOtp(phone);
      res.json({ success: true, message: "OTP sent successfully" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login/otp/verify", async (req, res) => {
    try {
      const { phone, otp } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ error: "Phone and OTP are required" });
      }

      const isValid = await verifyOtpCode(phone, otp);

      if (!isValid) {
        return res.status(401).json({ error: "Invalid or expired OTP" });
      }

      // Find user by phone number
      const user = await storage.getUserByPhone(phone);

      if (!user) {
        return res.status(404).json({ error: "User not found. Please register first." });
      }

      // Check if user is enabled
      if (user.enabled === false) {
        return res.status(403).json({ error: "Account is disabled. Please contact an administrator." });
      }

      const token = await createUserSession(user.id);
      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      res.json({ user: sanitizeUser(user), token });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/refresh", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Create a new session token
      const token = await createUserSession(req.user!.id);
      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      res.json({ token, user: sanitizeUser(req.user!) });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // User management routes (admin only)
  app.get("/api/users", requireAuth, requirePermission("users:read"), async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(sanitizeUser));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const updateSchema = z.object({
        email: z.string().email().optional(),
        name: z.string().optional(),
        role: z.enum(["admin", "analyst", "viewer"]).optional(),
        password: z.string().min(6).optional(),
        enabled: z.boolean().optional()
      });

      const data = updateSchema.parse(req.body);
      const updateData: any = {};

      if (data.email) updateData.email = data.email;
      if (data.name) updateData.name = data.name;
      if (data.role) updateData.role = data.role;
      if (data.password) updateData.password = await hashPassword(data.password);
      if (data.enabled !== undefined) updateData.enabled = data.enabled;

      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/users", requireAuth, requirePermission("users:create"), async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);

      // Check if email already exists
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(409).json({ error: "Email already exists" });
      }

      // Store plain password before hashing (needed for email)
      const plainPassword = data.password;
      const hashedPassword = await hashPassword(data.password);
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
        role: data.role || "viewer"
      });

      // Send emails asynchronously (don't block user creation if email fails)
      (async () => {
        try {
          // Send welcome email to new user
          await sendWelcomeEmail(
            user.email,
            user.name,
            plainPassword,
            user.role
          );

          // Get admin users and send notification emails
          const adminUsers = await storage.getAdminUsers();
          const creator = req.user!;
          const creatorName = creator.name || creator.email;

          // Send notification to all admins (excluding the creator if they're an admin)
          for (const admin of adminUsers) {
            // Don't send email to the creator if they're an admin
            if (admin.id !== creator.id) {
              try {
                await sendAdminNotificationEmail(
                  admin.email,
                  user.name,
                  user.email,
                  user.role,
                  creatorName
                );
              } catch (emailError) {
                console.error(`Failed to send admin notification to ${admin.email}:`, emailError);
              }
            }
          }
        } catch (emailError) {
          // Log email errors but don't fail user creation
          console.error("Error sending user creation emails:", emailError);
        }
      })();

      res.status(201).json(sanitizeUser(user));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Sector routes
  app.get("/api/sectors", requireAuth, async (req, res) => {
    try {
      const sectors = await storage.getAllSectors();
      res.json(sectors);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/sectors/:id", requireAuth, async (req, res) => {
    try {
      const sector = await storage.getSector(req.params.id);
      if (!sector) {
        return res.status(404).json({ error: "Sector not found" });
      }
      res.json(sector);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/sectors", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const data = insertSectorSchema.parse(req.body);
      const sector = await storage.createSector(data);
      res.json(sector);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/sectors/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const data = insertSectorSchema.partial().parse(req.body);
      const sector = await storage.updateSector(req.params.id, data);
      if (!sector) {
        return res.status(404).json({ error: "Sector not found" });
      }
      res.json(sector);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/sectors/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteSector(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Sector Mapping routes
  app.get("/api/v1/sector-mappings/:sectorId", requireAuth, requirePermission("sectors:read"), async (req, res) => {
    try {
      const { sectorId } = req.params;
      const mappings = await storage.getSectorMappingsByCustomSector(sectorId);
      res.json(mappings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/v1/sector-mappings", requireAuth, requirePermission("sectors:update"), async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        screenerSector: z.string().min(1),
        customSectorId: z.string().min(1),
      });
      const data = schema.parse(req.body);

      // Check if mapping already exists
      const existing = await storage.getSectorMappingsByScreenerSector(data.screenerSector);
      const duplicate = existing.find(m => m.customSectorId === data.customSectorId);
      if (duplicate) {
        return res.status(400).json({ error: "This mapping already exists" });
      }

      const mapping = await storage.createSectorMapping(data);
      res.json(mapping);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/v1/sector-mappings/:id", requireAuth, requirePermission("sectors:update"), async (req, res) => {
    try {
      await storage.deleteSectorMapping(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Scraping Logs routes
  app.get("/api/v1/scraping-logs/:companyId", requireAuth, requirePermission("data:read"), async (req, res) => {
    try {
      const { companyId } = req.params;
      const logs = await storage.getScrapingLogsByCompany(companyId);
      res.json(logs);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/v1/scraping-logs", requireAuth, requirePermission("data:read"), async (req, res) => {
    try {
      const { companyId, sectorId, status, limit } = req.query;
      const filters: any = {};
      if (companyId) filters.companyId = companyId as string;
      if (sectorId) filters.sectorId = sectorId as string;
      if (status) filters.status = status as string;
      if (limit) filters.limit = parseInt(limit as string, 10);

      const logs = await storage.getScrapingLogs(filters);
      res.json(logs);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/v1/companies/:ticker/last-scrape", requireAuth, requirePermission("data:read"), async (req, res) => {
    try {
      const { ticker } = req.params;
      const lastScrape = await storage.getLastScrapeTime(ticker);
      res.json({ ticker, lastScrape });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // CSV Bulk Import
  app.post("/api/v1/companies/bulk-import", requireAuth, requirePermission("companies:create"), async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        companies: z.array(z.object({
          ticker: z.string().min(1),
          name: z.string().optional(),
          sectorId: z.string().optional(),
          sector: z.string().optional(), // Support sector name
        })),
        autoScrape: z.boolean().optional(),
      });
      const { companies: companiesData, autoScrape } = schema.parse(req.body);

      const results = {
        success: 0,
        failed: 0,
        errors: [] as Array<{ ticker: string; error: string }>,
        importedTickers: [] as string[],
      };

      for (const companyData of companiesData) {
        try {
          let companyName = companyData.name;
          let sectorId = companyData.sectorId;

          // Handle sector name if provided (create or find sector) - PRIORITY 1
          if (!sectorId && companyData.sector) {
            let sector = await storage.getSectorByName(companyData.sector);
            if (!sector) {
              // Create new sector
              sector = await storage.createSector({
                name: companyData.sector,
                description: `Sector for ${companyData.sector} companies`,
              });
            }
            sectorId = sector.id;
          }

          // Check if company already exists in this sector (after sectorId is determined)
          if (sectorId) {
            const tickerUpper = companyData.ticker.toUpperCase();
            const existing = await storage.getCompanyByTickerAndSector(tickerUpper, sectorId);
            if (existing) {
              results.failed++;
              results.errors.push({ ticker: companyData.ticker, error: "Company already exists in this sector" });
              continue;
            }
          }

          // Auto-detect ONLY if both name AND sector are missing (PRIORITY 2)
          // If we have CSV data, use it instead of fetching
          if (!companyName && !sectorId) {
            try {
              // Add a small delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 100));

              const metadata = await scraper.fetchCompanyMetadata(companyData.ticker);

              if (metadata.exists) {
                if (!companyName && metadata.companyName) {
                  companyName = metadata.companyName;
                }

                if (!sectorId && metadata.detectedSector) {
                  // Check for sector mapping
                  const mappings = await storage.getSectorMappingsByScreenerSector(metadata.detectedSector);
                  if (mappings.length > 0) {
                    sectorId = mappings[0].customSectorId;
                  } else {
                    // Get or create sector
                    let sector = await storage.getSectorByName(metadata.detectedSector);
                    if (!sector) {
                      sector = await storage.createSector({
                        name: metadata.detectedSector,
                        description: `Sector for ${metadata.detectedSector} companies`,
                      });
                    }
                    sectorId = sector.id;
                  }
                }
              }
            } catch (metadataError: any) {
              // If metadata fetch fails, log but don't fail the import
              // We'll use fallback values below
              console.warn(`Metadata fetch failed for ${companyData.ticker}, using fallback:`, metadataError.message);
            }
          }

          // Fallback: Use ticker as name if name is missing
          if (!companyName) {
            companyName = `${companyData.ticker} (Name Unknown)`;
          }

          // Fallback: Create a default "Uncategorized" sector if sector is missing
          if (!sectorId) {
            let defaultSector = await storage.getSectorByName("Uncategorized");
            if (!defaultSector) {
              defaultSector = await storage.createSector({
                name: "Uncategorized",
                description: "Default sector for companies without a specified sector",
              });
            }
            sectorId = defaultSector.id;
          }

          // Create company
          await storage.createCompany({
            ticker: companyData.ticker.toUpperCase(),
            name: companyName,
            sectorId: sectorId,
          });

          results.success++;
          results.importedTickers.push(companyData.ticker.toUpperCase());
        } catch (error: any) {
          results.failed++;
          results.errors.push({ ticker: companyData.ticker, error: error.message || "Unknown error" });
        }
      }

      res.json(results);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Company routes
  app.get("/api/companies", requireAuth, requirePermission("companies:read"), async (req, res) => {
    try {
      const { sectorId } = req.query;
      const companies = sectorId
        ? await storage.getCompaniesBySector(sectorId as string)
        : await storage.getAllCompanies();
      res.json(companies);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/companies/:id", requireAuth, async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/companies/ticker/:ticker", requireAuth, async (req, res) => {
    try {
      const { ticker } = req.params;
      const { sectorId } = req.query;

      // If sectorId is provided, use getCompanyByTickerAndSector to get the specific company
      // Otherwise, fall back to getCompanyByTicker (for backward compatibility)
      const company = sectorId
        ? await storage.getCompanyByTickerAndSector(ticker, sectorId as string)
        : await storage.getCompanyByTicker(ticker);

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/companies", requireAuth, requirePermission("companies:create"), async (req, res) => {
    try {
      const schema = z.object({
        ticker: z.string().min(1),
        name: z.string().optional(),
        sectorId: z.string().min(1, "Sector is required"), // Now required
        marketCap: z.string().optional(),
        financialData: z.any().optional(),
        autoDetect: z.boolean().optional().default(false),
        detectedSector: z.string().optional(), // Sector name from auto-detection (for reference only)
      });

      const body = schema.parse(req.body);

      // Validate sectorId is provided
      if (!body.sectorId) {
        return res.status(400).json({
          error: "Sector is required. Please select a sector when creating a company."
        });
      }

      // If autoDetect is true, fetch metadata first
      let companyName = body.name;
      let sectorId = body.sectorId; // Use provided sectorId (required)
      let detectedSectorName = body.detectedSector;

      if (body.autoDetect && body.ticker) {
        const metadata = await scraper.fetchCompanyMetadata(body.ticker);

        if (!metadata.exists) {
          return res.status(404).json({ error: `Company with ticker ${body.ticker} not found on Screener.in` });
        }

        // Use detected name if not provided
        if (!companyName) {
          companyName = metadata.companyName;
        }

        // Note: We don't use detected sector anymore - user must provide sectorId
        // The detectedSector is only for reference/info, not for assignment
        if (metadata.detectedSector) {
          detectedSectorName = metadata.detectedSector;
        }
      }

      // Validate required fields
      if (!companyName) {
        return res.status(400).json({
          error: "Company name is required. Use autoDetect=true or provide it manually."
        });
      }

      // Validate sectorId exists
      const sector = await storage.getSector(sectorId);
      if (!sector) {
        return res.status(400).json({ error: `Invalid sector ID: ${sectorId}` });
      }

      // Check if company already exists in this sector
      const existingCompany = await storage.getCompanyByTickerAndSector(body.ticker.toUpperCase(), sectorId);
      if (existingCompany) {
        return res.status(400).json({ error: `Company with ticker ${body.ticker} already exists in this sector` });
      }

      const data = insertCompanySchema.parse({
        ticker: body.ticker.toUpperCase(),
        name: companyName,
        sectorId: sectorId,
        marketCap: body.marketCap,
        financialData: body.financialData,
      });

      const company = await storage.createCompany(data);
      res.json(company);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/companies/:id", requireAuth, requirePermission("companies:update"), async (req, res) => {
    try {
      const data = insertCompanySchema.partial().parse(req.body);
      const company = await storage.updateCompany(req.params.id, data);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/companies/:id", requireAuth, requirePermission("companies:delete"), async (req, res) => {
    try {
      await storage.deleteCompany(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk delete companies
  app.post("/api/companies/bulk-delete", requireAuth, requirePermission("companies:delete"), async (req, res) => {
    try {
      const schema = z.object({
        companyIds: z.array(z.string()).min(1, "At least one company ID is required"),
      });
      const { companyIds } = schema.parse(req.body);

      await storage.bulkDeleteCompanies(companyIds);
      res.json({ success: true, deleted: companyIds.length });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/companies/bulk", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const schema = z.object({
        companies: z.array(insertCompanySchema)
      });
      const { companies: companiesData } = schema.parse(req.body);

      if (companiesData.length === 0) {
        return res.status(400).json({ error: "No companies provided" });
      }

      if (companiesData.length > 1000) {
        return res.status(400).json({ error: "Maximum 1000 companies allowed per bulk import" });
      }

      const results = await storage.bulkCreateCompanies(companiesData);

      res.json({
        success: true,
        count: results.length,
        companies: results
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Quarterly Data routes
  app.get("/api/v1/companies/:ticker/data", requireAuth, requirePermission("data:read"), async (req, res) => {
    try {
      const { ticker } = req.params;
      const quarterlyData = await storage.getQuarterlyDataByTicker(ticker);

      // Group data by quarter for easier frontend consumption
      const groupedData: Record<string, Record<string, any>> = {};

      quarterlyData.forEach((item) => {
        if (!groupedData[item.quarter]) {
          groupedData[item.quarter] = {
            quarter: item.quarter,
            scrapeTimestamp: item.scrapeTimestamp,
            metrics: {}
          };
        }
        groupedData[item.quarter].metrics[item.metricName] = item.metricValue;
      });

      res.json({
        ticker,
        quarters: Object.values(groupedData),
        raw: quarterlyData
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get quarterly data for all companies in a sector
  app.get("/api/v1/sectors/:sectorId/quarterly-data", requireAuth, requirePermission("data:read"), async (req, res) => {
    try {
      const { sectorId } = req.params;
      const quarterlyData = await storage.getQuarterlyDataBySector(sectorId);
      const companies = await storage.getCompaniesBySector(sectorId);

      // Get all unique quarters and metrics
      const uniqueQuarters = Array.from(new Set(quarterlyData.map(d => d.quarter))).sort().reverse();
      const uniqueMetrics = Array.from(new Set(quarterlyData.map(d => d.metricName))).sort();

      // Group data by company ticker
      const companyData: Record<string, {
        ticker: string;
        companyId: string | null;
        companyName: string;
        quarters: Record<string, Record<string, string | null>>;
      }> = {};

      // Initialize company data
      companies.forEach(company => {
        companyData[company.ticker] = {
          ticker: company.ticker,
          companyId: company.id,
          companyName: company.name,
          quarters: {}
        };
      });

      // Populate quarterly data
      quarterlyData.forEach((item) => {
        if (!companyData[item.ticker]) {
          companyData[item.ticker] = {
            ticker: item.ticker,
            companyId: item.companyId || null,
            companyName: companies.find(c => c.ticker === item.ticker)?.name || item.ticker,
            quarters: {}
          };
        }
        if (!companyData[item.ticker].quarters[item.quarter]) {
          companyData[item.ticker].quarters[item.quarter] = {};
        }
        companyData[item.ticker].quarters[item.quarter][item.metricName] = item.metricValue?.toString() || null;
      });

      res.json({
        sectorId,
        quarters: uniqueQuarters,
        metrics: uniqueMetrics,
        companies: Object.values(companyData),
        raw: quarterlyData
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/v1/companies/bulk-scrape", requireAuth, requirePermission("data:read"), async (req, res) => {
    try {
      const { sectorId, conditions } = req.body;

      // Get all companies in the sector, optionally filtered by market cap
      let companies;
      if (conditions && (conditions.marketCapMin !== undefined || conditions.marketCapMax !== undefined)) {
        companies = await storage.getCompaniesBySectorAndMarketCap(
          sectorId,
          conditions.marketCapMin,
          conditions.marketCapMax
        );
      } else {
        companies = await storage.getCompaniesBySector(sectorId);
      }

      if (companies.length === 0) {
        return res.status(404).json({ error: "No companies found in this sector matching the criteria" });
      }

      // Get all signals for this company
      const signals = await storage.getSignalsByCompany(company.id);

      // Get formulas for context
      const formulaIds = [...new Set(signals.map(s => s.formulaId))];
      const formulas = await Promise.all(
        formulaIds.map(id => storage.getFormula(id))
      );
      const formulaMap = new Map(
        formulas.filter(f => f).map(f => [f!.id, f!])
      );

      // Enrich signals with formula details
      const enrichedSignals = signals.map(signal => ({
        ...signal,
        formula: formulaMap.get(signal.formulaId)
      }));

      res.json({
        ticker,
        companyId: company.id,
        signals: enrichedSignals,
        summary: {
          total: signals.length,
          buy: signals.filter(s => s.signal === "BUY").length,
          sell: signals.filter(s => s.signal === "SELL").length,
          hold: signals.filter(s => s.signal === "HOLD").length,
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Formula routes
  app.get("/api/formulas", requireAuth, requirePermission("formulas:read"), async (req, res) => {
    try {
      const formulas = await storage.getAllFormulas();
      res.json(formulas);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/formulas/:id", requireAuth, requirePermission("formulas:read"), async (req, res) => {
    try {
      const formula = await storage.getFormula(req.params.id);
      if (!formula) {
        return res.status(404).json({ error: "Formula not found" });
      }
      res.json(formula);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/formulas", requireAuth, requirePermission("formulas:create"), async (req: AuthRequest, res) => {
    try {
      // Auto-detect Excel formula type (contains Q12-Q16, P12-P16, or Excel functions)
      const condition = req.body.condition || "";
      const isExcelFormula = /[QP]\d+/.test(condition) ||
        /IF\(|AND\(|OR\(|NOT\(|ISNUMBER\(|MIN\(|ABS\(/i.test(condition);

      const data = insertFormulaSchema.parse({
        ...req.body,
        formulaType: isExcelFormula ? 'excel' : (req.body.formulaType || 'simple'),
        createdBy: req.user!.id
      });
      const formula = await storage.createFormula(data);
      res.json(formula);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/formulas/:id", requireAuth, requirePermission("formulas:update"), async (req, res) => {
    try {
      // Auto-detect Excel formula type if condition is being updated
      if (req.body.condition) {
        const condition = req.body.condition;
        const isExcelFormula = /[QP]\d+/.test(condition) ||
          /IF\(|AND\(|OR\(|NOT\(|ISNUMBER\(|MIN\(|ABS\(/i.test(condition);
        req.body.formulaType = isExcelFormula ? 'excel' : (req.body.formulaType || 'simple');
      }

      const data = insertFormulaSchema.partial().parse(req.body);
      const formula = await storage.updateFormula(req.params.id, data);
      if (!formula) {
        return res.status(404).json({ error: "Formula not found" });
      }
      res.json(formula);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/formulas/:id", requireAuth, requirePermission("formulas:delete"), async (req, res) => {
    try {
      await storage.deleteFormula(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Query routes
  app.get("/api/v1/queries", requireAuth, requirePermission("queries:read"), async (req: AuthRequest, res) => {
    try {
      const queries = await storage.getQueriesByUser(req.user!.id);
      res.json(queries);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/queries", requireAuth, async (req: AuthRequest, res) => {
    try {
      const queries = await storage.getQueriesByUser(req.user!.id);
      res.json(queries);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/queries/:id", requireAuth, async (req, res) => {
    try {
      const query = await storage.getQuery(req.params.id);
      if (!query) {
        return res.status(404).json({ error: "Query not found" });
      }
      res.json(query);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/v1/queries", requireAuth, requirePermission("queries:create"), async (req: AuthRequest, res) => {
    try {
      const { name, description, query } = req.body;

      if (!name || !query) {
        return res.status(400).json({ error: "Name and query are required" });
      }

      const queryData = insertQuerySchema.parse({
        name,
        description: description || "",
        criteria: { query, type: "excel" }, // Store as Excel query
        createdBy: req.user!.id,
      });

      const savedQuery = await storage.createQuery(queryData);
      res.json(savedQuery);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/queries", requireAuth, requireRole("admin", "analyst"), async (req: AuthRequest, res) => {
    try {
      const data = insertQuerySchema.parse({
        ...req.body,
        createdBy: req.user!.id
      });
      const query = await storage.createQuery(data);
      res.json(query);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/queries/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const data = insertQuerySchema.partial().parse(req.body);
      const query = await storage.updateQuery(req.params.id, data);
      if (!query) {
        return res.status(404).json({ error: "Query not found" });
      }
      res.json(query);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/v1/queries/:id", requireAuth, requirePermission("queries:delete"), async (req, res) => {
    try {
      await storage.deleteQuery(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/queries/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      await storage.deleteQuery(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  const executeQuerySchema = z.object({
    conditions: z.array(z.object({
      id: z.string(),
      field: z.string().min(1),
      operator: z.enum(["=", ">", "<", ">=", "<=", "contains"]),
      value: z.string(),
      logic: z.enum(["AND", "OR"]).optional(),
    })),
    limit: z.number().int().positive().max(1000).optional(),
    offset: z.number().int().nonnegative().optional(),
  });

  // Excel-like query execution
  app.post("/api/v1/queries/execute", requireAuth, requirePermission("queries:execute"), async (req, res) => {
    try {
      const { query, limit, offset } = req.body;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query string is required" });
      }

      const result = await excelQueryParser.executeQuery(
        query,
        limit || 100,
        offset || 0
      );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Legacy query execution (for backward compatibility)
  app.post("/api/queries/execute", requireAuth, async (req, res) => {
    try {
      const validated = executeQuerySchema.parse(req.body);

      const queryLimit = validated.limit || 100;
      const queryOffset = validated.offset || 0;

      const result = await queryExecutor.executeQuery(
        validated.conditions as QueryCondition[],
        queryLimit,
        queryOffset
      );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Signal routes
  app.get("/api/signals", requireAuth, async (req, res) => {
    try {
      const { companyId, formulaId } = req.query;
      let signals;

      if (companyId) {
        signals = await storage.getSignalsByCompany(companyId as string);
      } else if (formulaId) {
        signals = await storage.getSignalsByFormula(formulaId as string);
      } else {
        signals = await storage.getAllSignals();
      }

      res.json(signals);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Scraper routes (Admin only)
  app.post("/api/v1/scraper/scrape", requireAuth, requirePermission("scraper:trigger"), async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        tickers: z.array(z.string()).min(1).max(100),
      });
      const { tickers } = schema.parse(req.body);

      // Start scraping in background (non-blocking)
      scraper.scrapeCompanies(tickers).catch((error) => {
        console.error("Scraping error:", error);
      });

      res.json({
        success: true,
        message: `Scraping started for ${tickers.length} companies`,
        tickers,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/v1/scraper/status", requireAuth, requirePermission("scraper:view"), async (req, res) => {
    try {
      const status = scraper.getStatus();
      res.json(status);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Company metadata endpoint for auto-detection
  app.get("/api/v1/companies/metadata/:ticker", requireAuth, requirePermission("companies:read"), async (req, res) => {
    try {
      const { ticker } = req.params;
      const metadata = await scraper.fetchCompanyMetadata(ticker);
      res.json(metadata);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Verify/Get ticker by company name
  app.post("/api/v1/companies/verify-ticker", requireAuth, requirePermission("companies:read"), async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        companyName: z.string().min(1, "Company name is required"),
      });
      const { companyName } = schema.parse(req.body);

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await scraper.searchTickerByCompanyName(companyName);

      if (result && result.exists) {
        res.json({
          success: true,
          ticker: result.ticker,
          companyName: result.companyName,
          detectedSector: result.detectedSector,
        });
      } else {
        res.json({
          success: false,
          ticker: null,
          companyName: companyName,
          detectedSector: null,
          message: "Company not found on Screener.in",
        });
      }
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // Bulk scraping by sector with conditions
  app.post("/api/v1/scraper/scrape/sector", requireAuth, requirePermission("scraper:trigger"), async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        sectorId: z.string().min(1),
        conditions: z.object({
          marketCapMin: z.number().optional(),
          marketCapMax: z.number().optional(),
          otherConditions: z.string().optional(),
        }).optional(),
      });
      const { sectorId, conditions } = schema.parse(req.body);

      // Get all Screener.in sector names mapped to this custom sector
      const screenerSectors = await storage.getScreenerSectorsForCustomSector(sectorId);

      // Get all companies in this sector
      const allCompanies = await storage.getAllCompanies();
      const companies = allCompanies.filter(c => c.sectorId === sectorId);

      // Apply filters if conditions provided
      let companiesToScrape = companies;

      if (conditions?.marketCapMin || conditions?.marketCapMax) {
        companiesToScrape = companies.filter(company => {
          if (!company.marketCap) return false;
          const marketCap = parseFloat(company.marketCap);
          if (isNaN(marketCap)) return false;

          if (conditions.marketCapMin && marketCap < conditions.marketCapMin * 10000000) return false; // Convert crores to actual value
          if (conditions.marketCapMax && marketCap > conditions.marketCapMax * 10000000) return false;
          return true;
        });
      }

      const tickers = companiesToScrape.map(c => c.ticker);

      if (tickers.length === 0) {
        return res.json({
          success: true,
          message: "No companies found matching the conditions",
          tickers: [],
          total: 0,
        });
      }

      // Start scraping in background (non-blocking)
      // Pass sectorId so companies use their existing sector
      scraper.scrapeCompanies(tickers, sectorId).catch((error) => {
        console.error("Sector scraping error:", error);
      });

      res.json({
        success: true,
        message: `Scraping started for ${tickers.length} companies in sector`,
        sectorId,
        tickers,
        total: tickers.length,
        screenerSectors,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/v1/scraper/scrape/single", requireAuth, requirePermission("scraper:trigger"), async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        ticker: z.string().min(1),
        sectorId: z.string().optional(),
      });
      const { ticker, sectorId } = schema.parse(req.body);

      // Get user ID from authenticated request
      const userId = req.user?.id;

      // Get sector name if sectorId is provided
      let sectorOverride: string | undefined;
      if (sectorId) {
        const sector = await storage.getSector(sectorId);
        if (sector) {
          sectorOverride = sector.name;
        }
      }

      const result = await scraper.scrapeCompany(ticker, undefined, sectorOverride, userId);

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/signals/:id", requireAuth, async (req, res) => {
    try {
      const signal = await storage.getSignal(req.params.id);
      if (!signal) {
        return res.status(404).json({ error: "Signal not found" });
      }
      res.json(signal);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/signals", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const data = insertSignalSchema.parse(req.body);
      const signal = await storage.createSignal(data);
      res.json(signal);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/signals/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteSignal(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Signal calculation routes
  app.post("/api/signals/calculate", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const { companyIds } = req.body;

      if (companyIds && !Array.isArray(companyIds)) {
        return res.status(400).json({ error: "companyIds must be an array" });
      }

      const count = await FormulaEvaluator.calculateAndStoreSignals(companyIds);
      res.json({ success: true, signalsGenerated: count });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/signals/calculate/:companyId", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const count = await FormulaEvaluator.calculateAndStoreSignals([req.params.companyId]);
      res.json({ success: true, signalsGenerated: count, companyId: req.params.companyId });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Custom Tables routes
  app.get("/api/v1/tables", requireAuth, requirePermission("tables:read"), async (req: AuthRequest, res) => {
    try {
      const { type, sectorId, companyId } = req.query;

      let tables;
      if (type) {
        tables = await storage.getCustomTablesByType(type as string);
      } else if (sectorId) {
        tables = await storage.getCustomTablesBySector(sectorId as string);
      } else if (companyId) {
        tables = await storage.getCustomTablesByCompany(companyId as string);
      } else {
        // Get user's tables or all if admin
        if (req.user!.role === "admin") {
          tables = await storage.getAllCustomTables();
        } else {
          tables = await storage.getCustomTablesByUser(req.user!.id);
        }
      }

      res.json(tables);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/v1/tables/:id", requireAuth, requirePermission("tables:read"), async (req, res) => {
    try {
      const table = await storage.getCustomTable(req.params.id);
      if (!table) {
        return res.status(404).json({ error: "Table not found" });
      }
      res.json(table);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/v1/tables", requireAuth, requirePermission("tables:create"), async (req: AuthRequest, res) => {
    try {
      const { name, tableType, sectorId, companyId, columns, data } = req.body;

      if (!name || !tableType) {
        return res.status(400).json({ error: "Name and tableType are required" });
      }

      if (!["global", "sector", "company"].includes(tableType)) {
        return res.status(400).json({ error: "tableType must be 'global', 'sector', or 'company'" });
      }

      if (tableType === "sector" && !sectorId) {
        return res.status(400).json({ error: "sectorId is required for sector tables" });
      }

      if (tableType === "company" && !companyId) {
        return res.status(400).json({ error: "companyId is required for company tables" });
      }

      const tableData = insertCustomTableSchema.parse({
        name,
        tableType,
        sectorId: sectorId || null,
        companyId: companyId || null,
        columns: columns || [],
        data: data || [],
        createdBy: req.user!.id,
      });

      const table = await storage.createCustomTable(tableData);
      res.json(table);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/v1/tables/:id", requireAuth, requirePermission("tables:update"), async (req: AuthRequest, res) => {
    try {
      const table = await storage.getCustomTable(req.params.id);
      if (!table) {
        return res.status(404).json({ error: "Table not found" });
      }

      // Check if user owns the table or is admin
      if (table.createdBy !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "You don't have permission to update this table" });
      }

      const updateData = insertCustomTableSchema.partial().parse(req.body);
      const updated = await storage.updateCustomTable(req.params.id, updateData);

      if (!updated) {
        return res.status(404).json({ error: "Table not found" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/v1/tables/:id", requireAuth, requirePermission("tables:delete"), async (req: AuthRequest, res) => {
    try {
      const table = await storage.getCustomTable(req.params.id);
      if (!table) {
        return res.status(404).json({ error: "Table not found" });
      }

      // Check if user owns the table or is admin
      if (table.createdBy !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "You don't have permission to delete this table" });
      }

      await storage.deleteCustomTable(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Scheduler routes - Update all sectors
  app.post("/api/v1/scheduler/update-all-sectors", requireAuth, requirePermission("scraper:trigger"), async (req: AuthRequest, res) => {
    try {
      const sectors = await storage.getAllSectors();
      const taskId = `update-all-sectors-${Date.now()}`;

      // Create history record
      const history = await storage.createSectorUpdateHistory({
        userId: req.user!.id,
        status: 'pending',
        progress: 0,
        totalSectors: sectors.length,
        completedSectors: 0,
        successfulSectors: 0,
        failedSectors: 0,
        sectorResults: [],
      });

      // Create task in task manager
      taskManager.createTask(taskId, sectors.length);

      // Start the update process in background
      (async () => {
        try {
          taskManager.startTask(taskId);
          await storage.updateSectorUpdateHistory(history.id, { status: 'running' });

          for (const sector of sectors) {
            try {
              const companies = await storage.getCompaniesBySector(sector.id);

              if (companies.length === 0) {
                taskManager.addSectorResult(taskId, sector.id, sector.name, 'success', undefined, 0);
                const currentHistory = await storage.getSectorUpdateHistory(history.id);
                if (currentHistory) {
                  await storage.updateSectorUpdateHistory(history.id, {
                    completedSectors: (currentHistory.completedSectors || 0) + 1,
                    successfulSectors: (currentHistory.successfulSectors || 0) + 1,
                    progress: Math.round(((currentHistory.completedSectors || 0) + 1) / sectors.length * 100),
                    sectorResults: [...(currentHistory.sectorResults || []), {
                      sectorId: sector.id,
                      sectorName: sector.name,
                      status: 'success' as const,
                      companiesUpdated: 0,
                    }],
                  });
                }
                continue;
              }

              const tickers = companies.map(c => c.ticker);

              // Scrape companies
              const results = await scraper.scrapeCompanies(tickers);
              const successCount = results.filter(r => r.success).length;

              taskManager.addSectorResult(taskId, sector.id, sector.name, 'success', undefined, successCount);

              const currentHistory = await storage.getSectorUpdateHistory(history.id);
              if (currentHistory) {
                await storage.updateSectorUpdateHistory(history.id, {
                  completedSectors: (currentHistory.completedSectors || 0) + 1,
                  successfulSectors: (currentHistory.successfulSectors || 0) + 1,
                  progress: Math.round(((currentHistory.completedSectors || 0) + 1) / sectors.length * 100),
                  sectorResults: [...(currentHistory.sectorResults || []), {
                    sectorId: sector.id,
                    sectorName: sector.name,
                    status: 'success' as const,
                    companiesUpdated: successCount,
                  }],
                });
              }

              // Add delay between sectors
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error: any) {
              console.error(`Error updating sector ${sector.name}:`, error);
              taskManager.addSectorResult(taskId, sector.id, sector.name, 'error', error.message);

              const currentHistory = await storage.getSectorUpdateHistory(history.id);
              if (currentHistory) {
                await storage.updateSectorUpdateHistory(history.id, {
                  completedSectors: (currentHistory.completedSectors || 0) + 1,
                  failedSectors: (currentHistory.failedSectors || 0) + 1,
                  progress: Math.round(((currentHistory.completedSectors || 0) + 1) / sectors.length * 100),
                  sectorResults: [...(currentHistory.sectorResults || []), {
                    sectorId: sector.id,
                    sectorName: sector.name,
                    status: 'error' as const,
                    error: error.message,
                  }],
                });
              }
            }
          }

          // Mark as completed
          const finalHistory = await storage.getSectorUpdateHistory(history.id);
          if (finalHistory) {
            await storage.updateSectorUpdateHistory(history.id, {
              status: 'completed',
              progress: 100,
              completedAt: new Date(),
            });
          }
        } catch (error: any) {
          console.error("Error in update-all-sectors task:", error);
          taskManager.failTask(taskId, error.message);
          await storage.updateSectorUpdateHistory(history.id, {
            status: 'failed',
            error: error.message,
            completedAt: new Date(),
          });
        }
      })();

      res.json({
        taskId,
        historyId: history.id,
        totalSectors: sectors.length
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get task status
  app.get("/api/v1/scheduler/task/:taskId", requireAuth, requirePermission("scraper:read"), async (req, res) => {
    try {
      const task = taskManager.getTask(req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json({
        ...task,
        startTime: task.startTime?.toISOString(),
        endTime: task.endTime?.toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get sector update history
  app.get("/api/v1/scheduler/history", requireAuth, requirePermission("scraper:read"), async (req: AuthRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await storage.getAllSectorUpdateHistory(limit);

      // Get user info for each history entry
      const historyWithUsers = await Promise.all(history.map(async (h) => {
        const user = h.userId ? await storage.getUser(h.userId) : null;
        return {
          ...h,
          user: user ? { id: user.id, name: user.name, email: user.email } : null,
          startedAt: h.startedAt?.toISOString(),
          completedAt: h.completedAt?.toISOString(),
          createdAt: h.createdAt?.toISOString(),
        };
      }));

      res.json(historyWithUsers);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get specific history entry with details
  app.get("/api/v1/scheduler/history/:id", requireAuth, requirePermission("scraper:read"), async (req, res) => {
    try {
      const history = await storage.getSectorUpdateHistory(req.params.id);
      if (!history) {
        return res.status(404).json({ error: "History not found" });
      }

      const user = history.userId ? await storage.getUser(history.userId) : null;
      res.json({
        ...history,
        user: user ? { id: user.id, name: user.name, email: user.email } : null,
        startedAt: history.startedAt?.toISOString(),
        completedAt: history.completedAt?.toISOString(),
        createdAt: history.createdAt?.toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Main Signal Evaluation - Calculate signals using the main formula
  app.post("/api/v1/signals/calculate-main", requireAuth, requirePermission("signals:create"), async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        ticker: z.string().optional(),
        companyId: z.string().optional(),
        allCompanies: z.boolean().optional(),
      });
      const { ticker, companyId, allCompanies } = schema.parse(req.body);

      const { signals: signalsTable, companies } = await import("@shared/schema");
      let companiesToProcess: any[] = [];

      if (ticker) {
        const company = await storage.getCompanyByTicker(ticker);
        if (company) companiesToProcess.push(company);
      } else if (companyId) {
        const company = await storage.getCompany(companyId);
        if (company) companiesToProcess.push(company);
      } else if (allCompanies) {
        companiesToProcess = await storage.getAllCompanies();
      } else {
        return res.status(400).json({ error: "Must provide ticker, companyId, or set allCompanies to true" });
      }

      if (companiesToProcess.length === 0) {
        return res.status(404).json({ error: "No companies found" });
      }

      const results: Array<{ ticker: string; signal: string; error?: string }> = [];

      // Get or create main signal formula
      const { formulas } = await import("@shared/schema");
      let mainFormula = await db.select().from(formulas).where(eq(formulas.name, "Main Signal Formula")).limit(1);

      if (mainFormula.length === 0) {
        // Create the main signal formula
        const [newFormula] = await db.insert(formulas).values({
          name: "Main Signal Formula",
          condition: "Main signal evaluation based on quarterly metrics",
          signal: "BUY", // Default, will be updated per company
          enabled: true,
          priority: 0, // Highest priority
          scope: "global",
        }).returning();
        mainFormula = [newFormula];
      }

      const mainFormulaId = mainFormula[0].id;

      for (const company of companiesToProcess) {
        try {
          const signal = await evaluateMainSignalForCompany(company.ticker);

          // Delete existing main signals for this company (identified by formulaId)
          await db.delete(signalsTable).where(
            and(
              eq(signalsTable.companyId, company.id),
              eq(signalsTable.formulaId, mainFormulaId)
            )
          );

          // Insert new signal if not "No Signal"
          if (signal !== "No Signal") {
            await db.insert(signalsTable).values({
              companyId: company.id,
              formulaId: mainFormulaId,
              signal: signal,
              value: null,
              metadata: { type: "main_signal", formula: "main" },
            });
          }

          results.push({ ticker: company.ticker, signal });
        } catch (error: any) {
          results.push({ ticker: company.ticker, signal: "No Signal", error: error.message });
        }
      }

      res.json({
        success: true,
        processed: companiesToProcess.length,
        results,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get main signal for a company
  app.get("/api/v1/signals/main/:ticker", requireAuth, requirePermission("signals:read"), async (req, res) => {
    try {
      const { ticker } = req.params;
      const signal = await evaluateMainSignalForCompany(ticker);
      res.json({ ticker, signal });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Test Excel formula for a company
  app.post("/api/v1/formulas/test-excel", requireAuth, requirePermission("formulas:read"), async (req, res) => {
    try {
      const schema = z.object({
        ticker: z.string().min(1),
        formula: z.string().min(1),
        selectedQuarters: z.array(z.string()).optional(),
      });
      const { ticker, formula, selectedQuarters } = schema.parse(req.body);

      // evaluateExcelFormulaForCompany returns { result, resultType, usedQuarters }
      const evalResult = await evaluateExcelFormulaForCompany(ticker, formula, selectedQuarters);

      res.json({
        success: true,
        ticker,
        formula,
        result: evalResult.result,  // Extract the actual result value
        resultType: evalResult.resultType,  // Use the pre-computed result type
        usedQuarters: evalResult.usedQuarters,  // Include used quarters for reference
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get formula for a specific entity (company or sector)
  app.get("/api/v1/formulas/entity/:type/:id", requireAuth, requirePermission("formulas:read"), async (req, res) => {
    try {
      const { type, id } = req.params;
      
      if (type !== "company" && type !== "sector") {
        return res.status(400).json({ error: "Type must be 'company' or 'sector'" });
      }

      // Get all formulas
      const allFormulas = await storage.getAllFormulas();
      
      // Filter applicable formulas based on type and id
      const applicableFormulas = allFormulas
        .filter(f => f.enabled)
        .filter(f => {
          if (f.scope === "global") return true;
          if (f.scope === type && f.scopeValue === id) return true;
          return false;
        })
        .sort((a, b) => {
          // Sort by scope specificity: company > sector > global
          const scopeScore = (scope: string) => {
            if (scope === "company") return 3;
            if (scope === "sector") return 2;
            return 1;
          };
          const scoreA = scopeScore(a.scope);
          const scoreB = scopeScore(b.scope);
          if (scoreA !== scoreB) {
            return scoreB - scoreA; // Higher score first
          }
          // Then by priority (lower number = higher priority)
          return a.priority - b.priority;
        });

      // Return the highest priority formula, or null if none found
      const formula = applicableFormulas[0] || null;
      
      res.json({ formula });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // Bulk Import Job Endpoints
  // ============================================

  // Get all bulk import jobs
  app.get("/api/v1/bulk-import/jobs", requireAuth, requirePermission("companies:read"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const limit = parseInt(req.query.limit as string) || 50;
      const jobs = await storage.getAllBulkImportJobs(undefined, limit);
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get a specific bulk import job
  app.get("/api/v1/bulk-import/jobs/:id", requireAuth, requirePermission("companies:read"), async (req, res) => {
    try {
      const job = await storage.getBulkImportJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      const items = await storage.getBulkImportItemsByJob(job.id);
      const stats = await storage.getBulkImportStats(job.id);
      res.json({ ...job, items, stats });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items for a bulk import job
  app.get("/api/v1/bulk-import/jobs/:id/items", requireAuth, requirePermission("companies:read"), async (req, res) => {
    try {
      const status = req.query.status as string;
      let items;
      if (status) {
        items = await storage.getBulkImportItemsByStatus(req.params.id, status);
      } else {
        items = await storage.getBulkImportItemsByJob(req.params.id);
      }
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new bulk import job from CSV
  app.post("/api/v1/bulk-import/jobs", requireAuth, requirePermission("companies:create"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const schema = z.object({
        fileName: z.string(),
        items: z.array(z.object({
          ticker: z.string(),
          name: z.string(),
          sector: z.string(),
        })),
      });

      const { fileName, items } = schema.parse(req.body);

      // Create the job
      const job = await storage.createBulkImportJob({
        userId: authReq.user!.id,
        fileName,
        status: "pending",
        totalItems: items.length,
        processedItems: 0,
        successItems: 0,
        failedItems: 0,
        skippedItems: 0,
      });

      // Create items for the job
      const importItems = items.map((item) => ({
        jobId: job.id,
        ticker: item.ticker,
        companyName: item.name,
        sectorName: item.sector,
        status: "pending" as const,
      }));

      await storage.bulkCreateBulkImportItems(importItems);

      res.json({ success: true, job });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Start processing a bulk import job
  app.post("/api/v1/bulk-import/jobs/:id/start", requireAuth, requirePermission("companies:create"), async (req, res) => {
    try {
      const job = await storage.getBulkImportJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status === "running") {
        return res.status(400).json({ error: "Job is already running" });
      }

      // Update job status
      await storage.updateBulkImportJob(job.id, {
        status: "running",
        startedAt: new Date(),
      });

      // Start processing in background
      processBulkImportJob(job.id).catch((error) => {
        console.error("Bulk import job failed:", error);
        storage.updateBulkImportJob(job.id, {
          status: "failed",
          error: error.message,
          completedAt: new Date(),
        });
      });

      res.json({ success: true, message: "Job started" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel a bulk import job
  app.post("/api/v1/bulk-import/jobs/:id/cancel", requireAuth, requirePermission("companies:create"), async (req, res) => {
    try {
      const job = await storage.getBulkImportJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      await storage.updateBulkImportJob(job.id, {
        status: "cancelled",
        completedAt: new Date(),
      });

      res.json({ success: true, message: "Job cancelled" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Pause a bulk import job
  app.post("/api/v1/bulk-import/jobs/:id/pause", requireAuth, requirePermission("companies:create"), async (req, res) => {
    try {
      const job = await storage.getBulkImportJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "running") {
        return res.status(400).json({ error: "Job is not running" });
      }

      await storage.updateBulkImportJob(job.id, {
        status: "paused",
      });

      res.json({ success: true, message: "Job paused" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Resume a bulk import job
  app.post("/api/v1/bulk-import/jobs/:id/resume", requireAuth, requirePermission("companies:create"), async (req, res) => {
    try {
      const job = await storage.getBulkImportJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "paused") {
        return res.status(400).json({ error: "Job is not paused" });
      }

      await storage.updateBulkImportJob(job.id, {
        status: "running",
      });

      // Restart processing in background
      processBulkImportJob(job.id).catch((error) => {
        console.error("Bulk import job failed:", error);
        storage.updateBulkImportJob(job.id, {
          status: "failed",
          error: error.message,
          completedAt: new Date(),
        });
      });

      res.json({ success: true, message: "Job resumed" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Retry failed items in a bulk import job
  app.post("/api/v1/bulk-import/jobs/:id/retry", requireAuth, requirePermission("companies:create"), async (req, res) => {
    try {
      const job = await storage.getBulkImportJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Reset failed items to pending
      const items = await storage.getBulkImportItemsByJob(job.id);
      const failedItems = items.filter(i => i.status === "failed");

      for (const item of failedItems) {
        await storage.updateBulkImportItem(item.id, {
          status: "pending",
          error: null
        });
      }

      // Update job status to running and reset failed count
      await storage.updateBulkImportJob(job.id, {
        status: "running",
        failedItems: 0, // Reset failed count as we're retrying them
        completedAt: null, // Clear completed timestamp
      });

      // Restart processing in background
      processBulkImportJob(job.id).catch((error) => {
        console.error("Bulk import job failed:", error);
        storage.updateBulkImportJob(job.id, {
          status: "failed",
          error: error.message,
          completedAt: new Date(),
        });
      });

      res.json({ success: true, message: "Job retry started", retriedItems: failedItems.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a bulk import job
  app.delete("/api/v1/bulk-import/jobs/:id", requireAuth, requirePermission("companies:delete"), async (req, res) => {
    try {
      await storage.deleteBulkImportJob(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Export bulk import results as CSV
  app.get("/api/v1/bulk-import/jobs/:id/export", requireAuth, requirePermission("companies:read"), async (req, res) => {
    try {
      const status = req.query.status as string; // 'success', 'failed', or undefined for all
      const job = await storage.getBulkImportJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      let items;
      if (status) {
        items = await storage.getBulkImportItemsByStatus(job.id, status);
      } else {
        items = await storage.getBulkImportItemsByJob(job.id);
      }

      // Generate CSV
      const csvRows = ["ticker,name,sector,status,resolved_ticker,error,quarters_scraped,metrics_scraped"];
      for (const item of items) {
        const row = [
          item.ticker,
          `"${item.companyName.replace(/"/g, '""')}"`,
          `"${item.sectorName.replace(/"/g, '""')}"`,
          item.status,
          item.resolvedTicker || "",
          `"${(item.error || "").replace(/"/g, '""')}"`,
          item.quartersScraped?.toString() || "0",
          item.metricsScraped?.toString() || "0",
        ];
        csvRows.push(row.join(","));
      }

      const csv = csvRows.join("\n");
      const fileName = `bulk-import-${job.id}-${status || "all"}.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Settings Endpoints
  // ============================================

  // Get default metrics configuration
  app.get("/api/settings/default-metrics", requireAuth, requirePermission("settings:read"), async (req, res) => {
    try {
      const allMetrics = getAllMetrics();
      const visibleMetrics = loadVisibleMetrics();
      
      // Ensure all metrics are in the visible metrics object
      const metricsConfig: Record<string, boolean> = {};
      allMetrics.forEach(metric => {
        metricsConfig[metric] = visibleMetrics[metric] ?? false;
      });
      
      res.json({
        metrics: metricsConfig,
        visibleMetrics: getVisibleMetrics()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update default metrics configuration
  app.put("/api/settings/default-metrics", requireAuth, requirePermission("settings:write"), async (req, res) => {
    try {
      const schema = z.object({
        metrics: z.record(z.string(), z.boolean())
      });
      const { metrics } = schema.parse(req.body);
      
      const success = saveVisibleMetrics(metrics);
      if (success) {
        res.json({ 
          success: true, 
          message: "Default metrics updated successfully",
          metrics 
        });
      } else {
        res.status(500).json({ error: "Failed to save metrics configuration" });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get all available metrics from quarterly data
  app.get("/api/metrics/all", requireAuth, requirePermission("data:read"), async (req, res) => {
    try {
      // Get all unique metric names from quarterly data using SQL DISTINCT
      const result = await db.execute(sql`
        SELECT DISTINCT metric_name 
        FROM quarterly_data 
        WHERE metric_name IS NOT NULL 
        ORDER BY metric_name
      `);
      
      const uniqueMetrics = result.rows
        .map((row: any) => row.metric_name)
        .filter(Boolean)
        .sort();
      
      res.json({ metrics: uniqueMetrics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

// Background processor for bulk import jobs
async function processBulkImportJob(jobId: string): Promise<void> {
  console.log(`Starting bulk import job: ${jobId}`);

  const job = await storage.getBulkImportJob(jobId);
  if (!job || job.status !== "running") {
    console.log(`Job ${jobId} is not running, skipping`);
    return;
  }

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let processedCount = 0;

  const items = await storage.getBulkImportItemsByJob(jobId);

  for (const item of items) {
    // Check if job was cancelled or paused
    const currentJob = await storage.getBulkImportJob(jobId);
    if (!currentJob || currentJob.status === "cancelled") {
      console.log(`Job ${jobId} was cancelled, stopping`);
      break;
    }
    if (currentJob.status === "paused") {
      console.log(`Job ${jobId} was paused, stopping`);
      break;
    }

    // Skip already successful items (for resume/retry)
    if (item.status === "success") {
      continue;
    }

    try {
      // Update item status to processing
      await storage.updateBulkImportItem(item.id, { status: "processing" });

      // Step 1: Resolve sector (create if doesn't exist)
      let sector = await storage.getSectorByName(item.sectorName);
      if (!sector) {
        sector = await storage.createSector({ name: item.sectorName });
        console.log(`Created sector: ${item.sectorName}`);
      }

      // Step 2: Use the provided ticker directly (already verified via CSV ticker updater script)
      // Skip ticker verification/resolution since tickers are pre-verified
      const resolvedTicker = item.ticker.toUpperCase();
      
      // Update resolved ticker (same as provided ticker since it's already verified)
      await storage.updateBulkImportItem(item.id, { resolvedTicker });
      
      console.log(`Using verified ticker ${resolvedTicker} for ${item.companyName} (skipping verification)`);

      // Step 3: Check if company already exists in this sector
      let company = await storage.getCompanyByTickerAndSector(resolvedTicker, sector.id);

      if (company) {
        // Company already exists, just scrape data
        console.log(`Company ${resolvedTicker} already exists in sector ${item.sectorName}, scraping data...`);
      } else {
        // Check if resolved ticker exists in ANY sector (to avoid duplicates)
        const existingCompanyAnySector = await storage.getCompanyByTicker(resolvedTicker);
        if (existingCompanyAnySector) {
          // Company exists in a different sector - skip creation and just scrape
          console.log(`Company ${resolvedTicker} already exists in sector ${existingCompanyAnySector.sectorId}, skipping creation. Will scrape data for existing company.`);
          company = existingCompanyAnySector;
        } else {
          // Create new company with verified ticker
          try {
            company = await storage.createCompany({
              ticker: resolvedTicker,
              name: item.companyName,
              sectorId: sector.id,
            });
            console.log(`Created company: ${resolvedTicker} in sector ${item.sectorName}`);
          } catch (createError: any) {
            // If creation fails due to duplicate, try to find the existing company
            if (createError.message?.includes("duplicate key") || createError.message?.includes("unique constraint")) {
              console.log(`Company ${resolvedTicker} already exists (duplicate key error), finding existing company...`);
              company = await storage.getCompanyByTickerAndSector(resolvedTicker, sector.id) || 
                       await storage.getCompanyByTicker(resolvedTicker);
              if (!company) {
                throw createError; // Re-throw if we can't find it
              }
              console.log(`Found existing company: ${resolvedTicker} (ID: ${company.id})`);
            } else {
              throw createError; // Re-throw if it's a different error
            }
          }
        }
      }

      // Step 4: Scrape company data
      try {
        const scrapeResult = await scraper.scrapeCompany(
          company.ticker,
          company.id,
          sector.id // Use sector.id as sectorOverride to preserve the sector
        );

        if (scrapeResult.success) {
          await storage.updateBulkImportItem(item.id, {
            status: "success",
            sectorId: sector.id,
            companyId: company.id,
            quartersScraped: scrapeResult.quartersScraped || 0,
            metricsScraped: scrapeResult.metricsScraped || 0,
            processedAt: new Date(),
          });
          successCount++;
          console.log(`Successfully scraped ${company.ticker}`);
        } else {
          throw new Error(scrapeResult.error || "Unknown scraping error");
        }
      } catch (scrapeError: any) {
        // Company was created but scraping failed
        await storage.updateBulkImportItem(item.id, {
          status: "failed",
          sectorId: sector.id,
          companyId: company.id,
          error: `Scraping failed: ${scrapeError.message}`,
          processedAt: new Date(),
        });
        failedCount++;
        console.error(`Failed to scrape ${company.ticker}: ${scrapeError.message}`);
      }

    } catch (error: any) {
      await storage.updateBulkImportItem(item.id, {
        status: "failed",
        error: error.message,
        processedAt: new Date(),
      });
      failedCount++;
      console.error(`Failed to process ${item.ticker}: ${error.message}`);
    }

    processedCount++;

    // Update job progress
    await storage.updateBulkImportJob(jobId, {
      processedItems: processedCount,
      successItems: successCount,
      failedItems: failedCount,
      skippedItems: skippedCount,
    });
  }

  // Check final status to determine if we should mark as completed
  const finalJobCheck = await storage.getBulkImportJob(jobId);
  if (finalJobCheck && finalJobCheck.status !== "cancelled" && finalJobCheck.status !== "paused") {
    // Mark job as completed
    await storage.updateBulkImportJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      processedItems: processedCount,
      successItems: successCount,
      failedItems: failedCount,
      skippedItems: skippedCount,
    });
  }

  console.log(`Bulk import job ${jobId} completed: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`);
}
