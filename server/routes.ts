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
  generateOTPAuthURL
} from "./auth";
import { requireAuth, requireRole, type AuthRequest } from "./middleware";
import { sanitizeUser } from "./utils";
import { 
  insertUserSchema, 
  insertSectorSchema, 
  insertCompanySchema,
  insertFormulaSchema,
  insertQuerySchema,
  insertSignalSchema,
  users
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { queryExecutor, type QueryCondition } from "./queryExecutor";
import { FormulaEvaluator } from "./formulaEvaluator";

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
      res.json({ user: sanitizeUser(user) });
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
      res.json({ user: sanitizeUser(user) });
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

  // User management routes (admin only)
  app.get("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
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
        password: z.string().min(6).optional()
      });

      const data = updateSchema.parse(req.body);
      const updateData: any = {};
      
      if (data.email) updateData.email = data.email;
      if (data.name) updateData.name = data.name;
      if (data.role) updateData.role = data.role;
      if (data.password) updateData.password = await hashPassword(data.password);

      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(user));
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

  // Company routes
  app.get("/api/companies", requireAuth, async (req, res) => {
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
      const company = await storage.getCompanyByTicker(req.params.ticker);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/companies", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
    try {
      const data = insertCompanySchema.parse(req.body);
      const company = await storage.createCompany(data);
      res.json(company);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/companies/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
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

  app.delete("/api/companies/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteCompany(req.params.id);
      res.json({ success: true });
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

  // Formula routes
  app.get("/api/formulas", requireAuth, async (req, res) => {
    try {
      const formulas = await storage.getAllFormulas();
      res.json(formulas);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/formulas/:id", requireAuth, async (req, res) => {
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

  app.post("/api/formulas", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const data = insertFormulaSchema.parse({
        ...req.body,
        createdBy: req.user!.id
      });
      const formula = await storage.createFormula(data);
      res.json(formula);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/formulas/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
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

  app.delete("/api/formulas/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteFormula(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Query routes
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

  const httpServer = createServer(app);

  return httpServer;
}
