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
  insertRoleSchema,
  insertSectorSchema,
  insertCompanySchema,
  insertFormulaSchema,
  insertQuerySchema,
  insertSignalSchema,
  insertCustomTableSchema,
  users,
  roles,
  quarterlyData,
  type InsertSectorMapping
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, and, inArray, asc } from "drizzle-orm";
import { z } from "zod";
import { queryExecutor, type QueryCondition } from "./queryExecutor";
import { FormulaEvaluator } from "./formulaEvaluator";
import { scraper } from "./scraper";
import { excelQueryParser } from "./excelQueryParser";
import { sendWelcomeEmail, sendAdminNotificationEmail } from "./email";
import { taskManager } from "./taskManager";
import { evaluateMainSignalForCompany } from "./mainSignalEvaluator";
import { evaluateExcelFormulaForCompany, ExcelFormulaEvaluator } from "./excelFormulaEvaluator";
import { loadVisibleMetrics, saveVisibleMetrics, getAllMetrics, getVisibleMetrics, DEFAULT_VISIBLE_METRICS } from "./settingsManager";
import { ALL_PERMISSIONS } from "./permissions";
import { insertRoleSchema } from "@shared/schema";

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

  // Email OTP login endpoints
  app.post("/api/auth/login/otp/request", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email address is required" });
      }

      // Verify the email belongs to a registered user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "User not found. Please register first." });
      }

      // Check if user is enabled
      if (user.enabled === false) {
        return res.status(403).json({ error: "Account is disabled. Please contact an administrator." });
      }

      await createAndSendOtp(email);
      res.json({ success: true, message: "OTP sent successfully to your email" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login/otp/verify", async (req, res) => {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({ error: "Email and OTP are required" });
      }

      const isValid = await verifyOtpCode(email, otp);

      if (!isValid) {
        return res.status(401).json({ error: "Invalid or expired OTP" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);

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

  // PATCH endpoint for updating user role (for frontend compatibility)
  app.patch("/api/users/:id/role", requireAuth, requirePermission("users:update"), async (req, res) => {
    try {
      const updateSchema = z.object({
        role: z.string().min(1),
      });

      const data = updateSchema.parse(req.body);
      const user = await storage.updateUser(req.params.id, { role: data.role });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/users/:id", requireAuth, requirePermission("users:update"), async (req, res) => {
    try {
      const updateSchema = z.object({
        email: z.string().email().optional(),
        name: z.string().optional(),
        role: z.string().optional(), // Allow any role string, not just enum
        password: z.string().min(6).optional(),
        enabled: z.boolean().optional()
      });

      const data = updateSchema.parse(req.body);
      
      // Get the user being updated to check their role
      const existingUser = await storage.getUser(req.params.id);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Prevent disabling super_admin users
      if (data.enabled === false && existingUser.role === "super_admin") {
        return res.status(400).json({ error: "Cannot disable super admin users" });
      }

      // Prevent changing super_admin role to something else
      if (data.role && data.role !== "super_admin" && existingUser.role === "super_admin") {
        return res.status(400).json({ error: "Cannot change role of super admin users" });
      }

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
      // Check if user exists and prevent deletion of super admin users
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (user.role === "super_admin") {
        return res.status(400).json({ error: "Cannot delete super admin user" });
      }
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Roles management routes
  app.get("/api/roles", requireAuth, requirePermission("users:manage_roles"), async (req, res) => {
    try {
      const rolesList = await storage.getAllRoles();
      const allUsers = await storage.getAllUsers();
      
      // Count users per role
      const userCountsByRole: Record<string, number> = {};
      allUsers.forEach((user) => {
        userCountsByRole[user.role] = (userCountsByRole[user.role] || 0) + 1;
      });
      
      // Add user counts to roles
      const rolesWithCounts = rolesList.map((role) => ({
        ...role,
        userCount: userCountsByRole[role.name] || 0,
      }));
      
      res.json(rolesWithCounts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/roles/:id", requireAuth, requirePermission("users:manage_roles"), async (req, res) => {
    try {
      const role = await storage.getRole(req.params.id);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      res.json(role);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/roles", requireAuth, requirePermission("users:manage_roles"), async (req, res) => {
    try {
      const data = insertRoleSchema.parse(req.body);
      const role = await storage.createRole(data);
      // Also create/update role_permissions entry
      await storage.upsertRolePermissions(role.name, role.permissions);
      res.json(role);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/roles/:id", requireAuth, requirePermission("users:manage_roles"), async (req, res) => {
    try {
      const data = insertRoleSchema.partial().parse(req.body);
      const role = await storage.updateRole(req.params.id, data);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      // Also update role_permissions entry if permissions were updated
      if (data.permissions !== undefined) {
        await storage.upsertRolePermissions(role.name, role.permissions);
      }
      res.json(role);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/roles/:id", requireAuth, requirePermission("users:manage_roles"), async (req, res) => {
    try {
      const role = await storage.getRole(req.params.id);
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      // Prevent deletion of super_admin role specifically
      if (role.name === "super_admin") {
        return res.status(400).json({ error: "Cannot delete super_admin role" });
      }
      // Prevent deletion of system roles
      if (role.isSystem) {
        return res.status(400).json({ error: "Cannot delete system roles" });
      }
      await storage.deleteRole(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Permissions endpoint - returns all available permissions
  app.get("/api/permissions", requireAuth, requirePermission("users:manage_roles"), async (req, res) => {
    try {
      res.json({ permissions: ALL_PERMISSIONS });
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

  // Delete sector with all its companies
  app.delete("/api/sectors/:id/with-companies", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const result = await storage.deleteSectorWithCompanies(req.params.id);
      res.json({ 
        success: true, 
        companiesDeleted: result.companiesDeleted,
        message: `Sector and ${result.companiesDeleted} ${result.companiesDeleted === 1 ? 'company' : 'companies'} deleted successfully.`
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Assign formula to sector
  app.put("/api/v1/sectors/:id/assign-formula", requireAuth, requirePermission("sectors:update"), async (req, res) => {
    try {
      const schema = z.object({
        formulaId: z.string().nullable(), // null to clear assignment (use default)
      });
      const { formulaId } = schema.parse(req.body);

      // Validate formula exists if provided
      if (formulaId) {
        const formula = await storage.getFormula(formulaId);
        if (!formula) {
          return res.status(404).json({ error: "Formula not found" });
        }
      }

      const sector = await storage.assignFormulaToSector(req.params.id, formulaId);
      if (!sector) {
        return res.status(404).json({ error: "Sector not found" });
      }

      // Get the assigned formula details
      const assignedFormula = formulaId ? await storage.getFormula(formulaId) : null;

      // Get all companies in this sector
      const companies = await storage.getCompaniesBySector(req.params.id);
      
      // IMPORTANT: Clear any company-level formula assignments so they inherit the sector formula
      // This ensures all companies in the sector use the newly assigned sector formula
      let companiesCleared = 0;
      for (const company of companies) {
        if (company.assignedFormulaId) {
          await storage.assignFormulaToCompany(company.id, null);
          companiesCleared++;
        }
      }
      console.log(`[Sector Formula] Cleared ${companiesCleared} company-level formula assignments to inherit sector formula`);
      
      // Refresh the companies list after clearing assignments
      const updatedCompanies = await storage.getCompaniesBySector(req.params.id);
      
      // Immediately recalculate signals for all companies in the sector
      const results: Array<{ ticker: string; signal: string }> = [];
      
      if (updatedCompanies.length > 0) {
        const { FormulaEvaluator } = await import("./formulaEvaluator");
        const allFormulas = await storage.getAllFormulas();
        
        for (const company of updatedCompanies) {
          try {
            // Generate signal using the new formula assignment
            const result = await FormulaEvaluator.generateSignalForCompany(company, allFormulas);
            
            if (result) {
              // Delete existing signals for this company
              await storage.deleteSignalsByCompany(company.id);
              
              // Create new signal (value is already numeric string or null)
              await storage.createSignal({
                companyId: company.id,
                formulaId: result.formulaId,
                signal: result.signal,
                value: result.value,
                metadata: { 
                  condition: result.condition, // Store the formula condition string
                  usedQuarters: result.usedQuarters,
                  formulaName: result.formulaName,
                  sectorAssignment: true,
                  assignedAt: new Date().toISOString()
                }
              });
              
              results.push({ ticker: company.ticker, signal: result.signal });
            } else {
              // No signal generated, clear any existing signals
              await storage.deleteSignalsByCompany(company.id);
              results.push({ ticker: company.ticker, signal: "No Signal" });
            }
          } catch (calcError) {
            console.error(`[Routes] Error calculating signal for company ${company.id}:`, calcError);
            results.push({ ticker: company.ticker, signal: "Error" });
          }
        }
      }

      res.json({
        success: true,
        sector,
        assignedFormula: assignedFormula || null,
        companiesAffected: updatedCompanies.length,
        companiesCleared,
        results,
        message: formulaId 
          ? `Formula "${assignedFormula?.name}" assigned to sector, recalculated ${updatedCompanies.length} companies (${companiesCleared} overrides cleared)` 
          : `Formula assignment cleared, recalculated ${updatedCompanies.length} companies with default`
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get assigned formula for a sector
  app.get("/api/v1/sectors/:id/assigned-formula", requireAuth, requirePermission("sectors:read"), async (req, res) => {
    try {
      const sector = await storage.getSector(req.params.id);
      if (!sector) {
        return res.status(404).json({ error: "Sector not found" });
      }

      const assignedFormula = await storage.getAssignedFormulaForSector(req.params.id);

      // Get the global/default formula
      const allFormulas = await storage.getAllFormulas();
      const globalFormula = allFormulas.find(f => f.scope === "global" && f.enabled) || null;

      res.json({
        sectorId: sector.id,
        sectorName: sector.name,
        assignedFormulaId: sector.assignedFormulaId,
        assignedFormula: assignedFormula,
        globalFormula: globalFormula,
        effectiveFormula: assignedFormula || globalFormula,
        source: assignedFormula ? "sector" : "global"
      });
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

  // Get most recent scheduler activity (for dashboard)
  app.get("/api/v1/scheduler/last-activity", requireAuth, async (req, res) => {
    try {
      // Get most recent successful scraping log
      const recentLogs = await storage.getScrapingLogs({ status: "success", limit: 1 });
      const lastScrapeLog = recentLogs.length > 0 ? recentLogs[0] : null;

      // Get most recent sector update history
      const recentHistory = await storage.getAllSectorUpdateHistory(1);
      const lastSectorUpdate = recentHistory.length > 0 ? recentHistory[0] : null;

      // Determine which is more recent
      let lastActivity: { type: "scrape" | "sector_update"; timestamp: Date | null; details?: any } = {
        type: "scrape",
        timestamp: null,
      };

      if (lastScrapeLog?.completedAt && lastSectorUpdate?.completedAt) {
        if (new Date(lastScrapeLog.completedAt) > new Date(lastSectorUpdate.completedAt)) {
          lastActivity = {
            type: "scrape",
            timestamp: lastScrapeLog.completedAt,
            details: {
              ticker: lastScrapeLog.ticker,
              companiesUpdated: 1,
            },
          };
        } else {
          lastActivity = {
            type: "sector_update",
            timestamp: lastSectorUpdate.completedAt,
            details: {
              totalSectors: lastSectorUpdate.totalSectors,
              completedSectors: lastSectorUpdate.completedSectors,
            },
          };
        }
      } else if (lastScrapeLog?.completedAt) {
        lastActivity = {
          type: "scrape",
          timestamp: lastScrapeLog.completedAt,
          details: {
            ticker: lastScrapeLog.ticker,
            companiesUpdated: 1,
          },
        };
      } else if (lastSectorUpdate?.completedAt) {
        lastActivity = {
          type: "sector_update",
          timestamp: lastSectorUpdate.completedAt,
          details: {
            totalSectors: lastSectorUpdate.totalSectors,
            completedSectors: lastSectorUpdate.completedSectors,
          },
        };
      }

      res.json({
        lastActivity: lastActivity.timestamp ? {
          ...lastActivity,
          timestamp: lastActivity.timestamp.toISOString(),
        } : null,
      });
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
        dataType: z.enum(['consolidated', 'standalone', 'both']).optional().default('consolidated'), // Data type preference for scraping
      });
      const body = schema.parse(req.body);
      const { companies: companiesData, autoScrape } = body;

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
          const company = await storage.createCompany({
            ticker: companyData.ticker.toUpperCase(),
            name: companyName,
            sectorId: sectorId,
          });

          // Auto-scrape data if requested
          if (autoScrape) {
            try {
              const scrapeResult = await scraper.scrapeCompany(
                company.ticker,
                company.id,
                undefined, // sectorOverride - use company's sector
                undefined, // userId
                body.dataType || 'consolidated'
              );
              
              if (!scrapeResult.success) {
                console.warn(`[Routes] Auto-scrape failed for ${company.ticker}: ${scrapeResult.error}`);
                // Don't fail company creation if scraping fails
              } else {
                console.log(`[Routes] Auto-scraped ${scrapeResult.quartersScraped} quarters and ${scrapeResult.metricsScraped} metrics for ${company.ticker}`);
              }
            } catch (scrapeError: any) {
              console.error(`[Routes] Error during auto-scrape for ${company.ticker}:`, scrapeError);
              // Don't fail company creation if scraping errors
            }
          }

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
        dataType: z.enum(['consolidated', 'standalone', 'both']).optional().default('consolidated'), // Data type preference
        autoScrape: z.boolean().optional().default(true), // Whether to automatically scrape data after creation
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
        console.log(`[Routes] Auto-detecting company metadata for ticker: ${body.ticker}`);
        const metadata = await scraper.fetchCompanyMetadata(body.ticker);
        console.log(`[Routes] Metadata fetch result:`, {
          exists: metadata.exists,
          companyName: metadata.companyName,
          detectedSector: metadata.detectedSector,
        });

        if (!metadata.exists) {
          console.warn(`[Routes] Company not found for ticker: ${body.ticker}`);
          return res.status(404).json({ error: `Company with ticker ${body.ticker} not found on Screener.in` });
        }

        // Use detected name if not provided (and it's valid)
        if (!companyName && metadata.companyName && metadata.companyName !== 'Unknown Company' && metadata.companyName.trim() !== '') {
          companyName = metadata.companyName;
          console.log(`[Routes] Using detected company name: ${companyName}`);
        } else if (companyName) {
          console.log(`[Routes] Using provided company name: ${companyName}`);
        } else {
          console.warn(`[Routes] No valid company name found. Provided: "${body.name}", Detected: "${metadata.companyName}"`);
        }

        // Note: We don't use detected sector anymore - user must provide sectorId
        // The detectedSector is only for reference/info, not for assignment
        if (metadata.detectedSector) {
          detectedSectorName = metadata.detectedSector;
        }
      }

      // Validate required fields
      if (!companyName || companyName.trim() === '' || companyName === 'Unknown Company') {
        return res.status(400).json({
          error: "Company name is required. Use autoDetect=true or provide it manually."
        });
      }

      // Validate sectorId is provided and exists
      if (!sectorId) {
        return res.status(400).json({ error: "Sector is required. Please select a sector when creating a company." });
      }

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

      // Auto-scrape data if requested
      if (body.autoScrape) {
        try {
          const scrapeResult = await scraper.scrapeCompany(
            company.ticker,
            company.id,
            company.sectorId,
            req.user?.id,
            body.dataType || 'consolidated'
          );
          
          if (!scrapeResult.success) {
            console.warn(`[Routes] Auto-scrape failed for ${company.ticker}: ${scrapeResult.error}`);
            // Don't fail company creation if scraping fails
          } else {
            console.log(`[Routes] Auto-scraped ${scrapeResult.quartersScraped} quarters and ${scrapeResult.metricsScraped} metrics for ${company.ticker}`);
          }
        } catch (scrapeError: any) {
          console.error(`[Routes] Error during auto-scrape for ${company.ticker}:`, scrapeError);
          // Don't fail company creation if scraping errors
        }
      }

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
      
      // Trigger signal recalculation for this company in the background
      // Only trigger if financial data or market cap was updated (data that affects signals)
      if (data.financialData !== undefined || data.marketCap !== undefined) {
        const { signalProcessor } = await import("./signalProcessor");
        signalProcessor.enqueueJob("company", [company.id]).catch((error) => {
          console.error(`[Routes] Failed to queue signal recalculation for company ${company.id}:`, error);
        });
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

  // Assign formula to company
  app.put("/api/v1/companies/:id/assign-formula", requireAuth, requirePermission("companies:update"), async (req, res) => {
    try {
      const schema = z.object({
        formulaId: z.string().nullable(), // null to clear assignment (use default)
      });
      const { formulaId } = schema.parse(req.body);

      // Validate formula exists if provided
      if (formulaId) {
        const formula = await storage.getFormula(formulaId);
        if (!formula) {
          return res.status(404).json({ error: "Formula not found" });
        }
      }

      const company = await storage.assignFormulaToCompany(req.params.id, formulaId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Get the assigned formula details
      const assignedFormula = formulaId ? await storage.getFormula(formulaId) : null;

      // Immediately recalculate signal for this company using the new formula
      let newSignal = "No Signal";
      let calculationError: string | null = null;
      try {
        const { FormulaEvaluator } = await import("./formulaEvaluator");
        const allFormulas = await storage.getAllFormulas();
        
        // Generate signal using the new formula assignment
        const result = await FormulaEvaluator.generateSignalForCompany(company, allFormulas);
        
        if (result) {
          // Delete existing signals for this company
          await storage.deleteSignalsByCompany(company.id);
          
          // Create new signal (value is already numeric string or null from FormulaEvaluator)
          await storage.createSignal({
            companyId: company.id,
            formulaId: result.formulaId,
            signal: result.signal,
            value: result.value,
            metadata: { 
              condition: result.condition, // Store the formula condition string
              usedQuarters: result.usedQuarters,
              formulaName: result.formulaName,
              companyAssignment: true,
              assignedAt: new Date().toISOString()
            }
          });
          
          newSignal = result.signal;
        } else {
          // No signal generated, clear any existing signals
          await storage.deleteSignalsByCompany(company.id);
        }
      } catch (calcError) {
        calculationError = calcError instanceof Error ? calcError.message : "Unknown error";
        console.error(`[Routes] Error calculating signal for company ${company.id}:`, calcError);
        // Don't fail the entire request - formula assignment succeeded, just signal calculation failed
      }

      const baseMessage = formulaId 
        ? `Formula "${assignedFormula?.name}" assigned to company. Signal: ${newSignal}` 
        : `Formula assignment cleared, using default. Signal: ${newSignal}`;
      
      const message = calculationError 
        ? `${baseMessage} (Warning: Signal calculation failed: ${calculationError})`
        : baseMessage;

      res.json({
        success: true,
        company,
        assignedFormula: assignedFormula || null,
        newSignal,
        message,
        calculationError: calculationError || null
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get assigned formula for a company
  app.get("/api/v1/companies/:id/assigned-formula", requireAuth, requirePermission("companies:read"), async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const assignedFormula = await storage.getAssignedFormulaForCompany(req.params.id);
      
      // If no company-level assignment, check sector
      let sectorFormula = null;
      if (!assignedFormula && company.sectorId) {
        sectorFormula = await storage.getAssignedFormulaForSector(company.sectorId);
      }

      // Get the global/default formula (Main Signal Formula)
      const allFormulas = await storage.getAllFormulas();
      const globalFormula = allFormulas.find(f => f.scope === "global" && f.enabled) || null;

      res.json({
        companyId: company.id,
        companyName: company.name,
        assignedFormulaId: company.assignedFormulaId,
        assignedFormula: assignedFormula,
        sectorFormula: sectorFormula,
        globalFormula: globalFormula,
        effectiveFormula: assignedFormula || sectorFormula || globalFormula,
        source: assignedFormula ? "company" : sectorFormula ? "sector" : "global"
      });
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

  // Get signals for a company by ticker - includes formula assignment info
  app.get("/api/v1/companies/:ticker/signals", requireAuth, requirePermission("signals:read"), async (req, res) => {
    try {
      const { ticker } = req.params;
      const { companyId } = req.query;

      // Prefer explicit companyId if provided (avoids ambiguity when multiple companies share a ticker)
      const company = companyId
        ? await storage.getCompany(companyId as string)
        : await storage.getCompanyByTicker(ticker);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Get all signals for this company
      const companySignals = await storage.getSignalsByCompany(company.id);

      // Get formulas for context
      const formulaIds = [...new Set(companySignals.map(s => s.formulaId))];
      const formulas = await Promise.all(
        formulaIds.map(id => storage.getFormula(id))
      );
      const formulaMap = new Map(
        formulas.filter(f => f).map(f => [f!.id, f!])
      );

      // Enrich signals with formula details
      const enrichedSignals = companySignals.map(signal => ({
        ...signal,
        formula: formulaMap.get(signal.formulaId)
      }));

      // Get effective formula information (company assigned > sector assigned > global)
      let effectiveFormula = null;
      let formulaSource = "global";

      // Check company-level assignment first
      if (company.assignedFormulaId) {
        effectiveFormula = await storage.getFormula(company.assignedFormulaId);
        if (effectiveFormula) {
          formulaSource = "company";
        }
      }

      // If no company assignment, check sector
      if (!effectiveFormula && company.sectorId) {
        const sector = await storage.getSector(company.sectorId);
        if (sector?.assignedFormulaId) {
          effectiveFormula = await storage.getFormula(sector.assignedFormulaId);
          if (effectiveFormula) {
            formulaSource = "sector";
          }
        }
      }

      // If still no assignment, get global formula
      if (!effectiveFormula) {
        const allFormulas = await storage.getAllFormulas();
        effectiveFormula = allFormulas.find(f => f.scope === "global" && f.enabled && f.priority === 0) 
          || allFormulas.find(f => f.scope === "global" && f.enabled)
          || null;
      }

      res.json({
        ticker,
        companyId: company.id,
        companyName: company.name,
        assignedFormulaId: company.assignedFormulaId,
        signals: enrichedSignals,
        summary: {
          total: companySignals.length,
          buy: companySignals.filter(s => s.signal === "BUY").length,
          sell: companySignals.filter(s => s.signal === "SELL").length,
          hold: companySignals.filter(s => s.signal === "HOLD").length,
        },
        effectiveFormula: effectiveFormula ? {
          id: effectiveFormula.id,
          name: effectiveFormula.name,
          signal: effectiveFormula.signal,
          scope: effectiveFormula.scope
        } : null,
        formulaSource
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
          // Find matching company to get name
          const matchingCompany = companies.find(c => c.ticker === item.ticker);
          companyData[item.ticker] = {
            ticker: item.ticker,
            companyId: item.companyId || matchingCompany?.id || null,
            companyName: matchingCompany?.name || item.ticker,
            quarters: {}
          };
        }
        // Ensure companyName is always populated (in case it was null from initial creation)
        if (!companyData[item.ticker].companyName || companyData[item.ticker].companyName === 'null') {
          const matchingCompany = companies.find(c => c.ticker === item.ticker);
          companyData[item.ticker].companyName = matchingCompany?.name || item.ticker;
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
      // Handle unique constraint violation for formula name
      if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint') || 
          error.code === '23505') {
        return res.status(400).json({ 
          error: `A formula with the name "${req.body.name}" already exists. Please choose a different name.` 
        });
      }
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

      // Trigger signal recalculation for affected companies
      // Determine which companies are affected by this formula update
      let affectedCompanyIds: string[] = [];
      
      if (formula.scope === "company" && formula.scopeValue) {
        // Company-scoped formula: only this company is affected
        affectedCompanyIds = [formula.scopeValue];
      } else if (formula.scope === "sector" && formula.scopeValue) {
        // Sector-scoped formula: all companies in this sector are affected
        const sectorCompanies = await storage.getCompaniesBySector(formula.scopeValue);
        affectedCompanyIds = sectorCompanies.map(c => c.id);
      } else if (formula.scope === "global") {
        // Global formula: need to find companies using this formula
        // 1. Companies that have this formula explicitly assigned
        const allCompanies = await storage.getAllCompanies();
        const companiesWithThisFormula = allCompanies.filter(c => c.assignedFormulaId === formula.id);
        const assignedCompanyIds = companiesWithThisFormula.map(c => c.id);
        
        // 2. For global formulas, we'd need to check if this is the highest priority global formula
        // Since this is complex and global formulas affect many companies, 
        // we'll recalculate all companies that don't have explicit formula assignments
        // (those using global formulas) + companies explicitly assigned to this formula
        const { formulas: formulasTable } = await import("@shared/schema");
        const allFormulas = await storage.getAllFormulas();
        const globalFormulas = allFormulas
          .filter(f => f.enabled && f.scope === "global")
          .sort((a, b) => a.priority - b.priority);
        
        const isHighestPriorityGlobal = globalFormulas.length > 0 && globalFormulas[0].id === formula.id;
        
        if (isHighestPriorityGlobal || assignedCompanyIds.length > 0) {
          // If this is the highest priority global formula or has explicit assignments,
          // recalculate all companies (those with assignments + those using global formulas)
          // For simplicity, recalculate all companies when a global formula changes
          // Can be optimized later with better tracking
          affectedCompanyIds = allCompanies.map(c => c.id);
        } else {
          // Only recalculate companies explicitly assigned to this formula
          affectedCompanyIds = assignedCompanyIds;
        }
      }
      
      // Queue async recalculation for affected companies
      if (affectedCompanyIds.length > 0) {
        const { signalProcessor } = await import("./signalProcessor");
        signalProcessor.enqueueJob("company", affectedCompanyIds).catch((err) => {
          console.error(`[Routes] Failed to queue signal recalculation for formula ${formula.id}:`, err);
          // Don't fail the request if queuing fails - formula update still succeeded
        });
        console.log(`[Routes] Queued signal recalculation for ${affectedCompanyIds.length} companies after formula update`);
      }

      res.json(formula);
    } catch (error: any) {
      // Handle unique constraint violation for formula name
      if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint') || 
          error.code === '23505') {
        return res.status(400).json({ 
          error: `A formula with the name "${req.body.name}" already exists. Please choose a different name.` 
        });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // Reset all formula assignments to global (clears all sector and company-level assignments)
  // IMPORTANT: This route must be defined BEFORE /api/formulas/:id to avoid route matching conflicts
  app.post("/api/formulas/reset-all-to-global", requireAuth, requirePermission("formulas:update"), async (req, res) => {
    try {
      const { formulaId } = req.body; // Optional: if provided, assign this formula to all companies/sectors
      
      const result = await storage.resetAllFormulasToGlobal(formulaId || null);
      
      const message = formulaId 
        ? `Assigned formula to all companies and sectors. ${result.companiesAffected} companies and ${result.sectorsAffected} sectors affected.`
        : `Reset all formula assignments to global. ${result.companiesAffected} companies and ${result.sectorsAffected} sectors affected.`;
      
      res.json({
        success: true,
        message,
        companiesAffected: result.companiesAffected,
        sectorsAffected: result.sectorsAffected
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Check if a formula can be deleted (checks if it's a main/global formula)
  app.get("/api/formulas/:id/can-delete", requireAuth, requirePermission("formulas:read"), async (req, res) => {
    try {
      const result = await storage.checkFormulaCanDelete(req.params.id);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Replace main formula with another formula
  app.post("/api/formulas/:id/replace", requireAuth, requirePermission("formulas:update"), async (req, res) => {
    try {
      const { newFormulaId } = req.body;
      if (!newFormulaId) {
        return res.status(400).json({ error: "newFormulaId is required" });
      }
      const result = await storage.replaceMainFormula(req.params.id, newFormulaId);
      res.json({
        success: true,
        message: `Main formula replaced successfully. ${result.companiesAffected} companies, ${result.sectorsAffected} sectors, and ${result.signalsAffected} signals updated.`,
        ...result
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/formulas/:id", requireAuth, requirePermission("formulas:delete"), async (req, res) => {
    try {
      // Check if this is a main formula that needs replacement
      const checkResult = await storage.checkFormulaCanDelete(req.params.id);
      if (!checkResult.canDelete && checkResult.isMainFormula) {
        return res.status(400).json({ 
          error: checkResult.message,
          isMainFormula: true,
          requiresReplacement: true
        });
      }
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
      const { companyId, formulaId, stale } = req.query;
      let signals;

      if (companyId) {
        signals = await storage.getSignalsByCompany(companyId as string);
      } else if (formulaId) {
        signals = await storage.getSignalsByFormula(formulaId as string);
      } else {
        signals = await storage.getAllSignals();
      }

      // If stale parameter is true, filter to only return signals for companies with stale data
      if (stale === "true") {
        const { FormulaEvaluator } = await import("./formulaEvaluator");
        const staleCompanies = await FormulaEvaluator.findStaleSignalCompanies();
        const staleCompanyIds = new Set(staleCompanies.map(c => c.id));
        signals = signals.filter(s => staleCompanyIds.has(s.companyId));
      }

      // Add caching headers (5 minutes TTL for signal data)
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("ETag", `"${Date.now()}"`);

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
        dataType: z.enum(['consolidated', 'standalone', 'both']).optional().default('consolidated'),
        dryRun: z.boolean().optional().default(false), // If true, don't save to database
      });
      const { ticker, sectorId, dataType, dryRun } = schema.parse(req.body);

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

      const result = await scraper.scrapeCompany(ticker, undefined, sectorOverride, userId, dataType);

      // Check if data was actually retrieved
      const hasQuarterlyData = result.quartersScraped && result.quartersScraped > 0;
      const dataSource = dataType === 'both' ? 'consolidated or standalone' : dataType;

      if (!hasQuarterlyData) {
        // Return info about null data but don't save
        return res.json({
          success: false,
          error: `No quarterly data found from ${dataSource} source for ${ticker}. Database was not updated.`,
          dataType,
          quartersScraped: 0,
          metricsScraped: 0,
          noDataFromSource: true,
        });
      }

      res.json({
        ...result,
        dataType,
        dataSource: result.quarterlyDataSource || dataSource,
      });
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
      const schema = z.object({
        companyIds: z.array(z.string()).optional(),
        incremental: z.boolean().optional().default(false),
        batchSize: z.number().optional(),
        async: z.boolean().optional().default(false),
      });
      const { companyIds, incremental, batchSize, async: asyncMode } = schema.parse(req.body);

      if (companyIds && !Array.isArray(companyIds)) {
        return res.status(400).json({ error: "companyIds must be an array" });
      }

      // If async mode, queue the job and return immediately
      if (asyncMode) {
        const { signalProcessor } = await import("./signalProcessor");
        const jobType = incremental ? "incremental" : companyIds ? "company" : "full";
        const jobId = await signalProcessor.enqueueJob(jobType, companyIds, batchSize);
        
        return res.json({
          success: true,
          jobId,
          message: "Signal calculation queued",
          type: jobType,
        });
      }

      // Synchronous processing
      if (incremental) {
        const { FormulaEvaluator } = await import("./formulaEvaluator");
        const result = await FormulaEvaluator.calculateStaleSignals(batchSize);
        res.json({
          success: true,
          signalsGenerated: result.signalsGenerated,
          processed: result.processed,
          incremental: true,
        });
      } else {
        const count = await FormulaEvaluator.calculateAndStoreSignals(companyIds);
        res.json({ success: true, signalsGenerated: count });
      }
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

  // Signal status endpoint
  app.get("/api/v1/signals/status", requireAuth, requirePermission("signals:read"), async (req, res) => {
    try {
      const statistics = await storage.getSignalStatistics();
      const { signalProcessor } = await import("./signalProcessor");
      const queueStatus = signalProcessor.getQueueStatus();

      res.json({
        ...statistics,
        queue: queueStatus,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Signal distribution grouped by signal value (supports custom signals)
  app.get("/api/v1/signals/distribution", requireAuth, requirePermission("signals:read"), async (_req, res) => {
    try {
      const distribution = await storage.getSignalDistribution();
      res.json({ distribution });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get job status
  app.get("/api/v1/signals/job/:jobId", requireAuth, requirePermission("signals:read"), async (req, res) => {
    try {
      const { signalProcessor } = await import("./signalProcessor");
      const job = signalProcessor.getJobStatus(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
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
  // Scheduler Settings endpoints
  app.get("/api/v1/scheduler/settings", requireAuth, requirePermission("scraper:read"), async (req, res) => {
    try {
      const settings = await storage.getAllSchedulerSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/v1/scheduler/settings/:jobType", requireAuth, requirePermission("scraper:update"), async (req, res) => {
    try {
      const { jobType } = req.params;
      const schema = z.object({
        schedule: z.string().optional(),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
      });
      const data = schema.parse(req.body);

      const setting = await storage.upsertSchedulerSetting({
        jobType,
        schedule: data.schedule || "0 6 * * *",
        enabled: data.enabled !== undefined ? data.enabled : true,
        description: data.description,
      });

      // Reload scheduler with new settings
      const { scrapingScheduler } = await import("./scheduler");
      await scrapingScheduler.reloadSchedules();

      res.json(setting);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Test endpoint to manually trigger daily scraping
  app.post("/api/v1/scheduler/test/daily-scraping", requireAuth, requirePermission("scraper:trigger"), async (req, res) => {
    try {
      const { scrapingScheduler } = await import("./scheduler");
      await scrapingScheduler.triggerDailyScraping();
      res.json({ success: true, message: "Daily scraping triggered successfully" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

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

  // Sector Schedule endpoints
  app.get("/api/v1/scheduler/sector-schedules", requireAuth, requirePermission("scraper:read"), async (req, res) => {
    try {
      const schedules = await storage.getAllSectorSchedules();
      // Enrich with sector information
      const enrichedSchedules = await Promise.all(
        schedules.map(async (schedule) => {
          const sector = await storage.getSector(schedule.sectorId);
          return {
            ...schedule,
            sector: sector ? { id: sector.id, name: sector.name } : null,
          };
        })
      );
      res.json(enrichedSchedules);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/v1/scheduler/sector-schedules/:sectorId", requireAuth, requirePermission("scraper:read"), async (req, res) => {
    try {
      const schedule = await storage.getSectorSchedule(req.params.sectorId);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      const sector = await storage.getSector(schedule.sectorId);
      res.json({
        ...schedule,
        sector: sector ? { id: sector.id, name: sector.name } : null,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/v1/scheduler/sector-schedules", requireAuth, requirePermission("scraper:update"), async (req, res) => {
    try {
      const schema = z.object({
        sectorId: z.string().min(1),
        schedule: z.string().min(1),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
      });
      const data = schema.parse(req.body);

      // Convert time to cron if needed (format: "HH:MM" -> "MM HH * * *")
      let cronSchedule = data.schedule;
      if (data.schedule.match(/^\d{2}:\d{2}$/)) {
        const [hour, minute] = data.schedule.split(":");
        cronSchedule = `${minute} ${hour} * * *`;
      }

      const schedule = await storage.upsertSectorSchedule({
        sectorId: data.sectorId,
        schedule: cronSchedule,
        enabled: data.enabled !== undefined ? data.enabled : true,
        description: data.description,
      });

      // Reload scheduler with new settings
      const { scrapingScheduler } = await import("./scheduler");
      await scrapingScheduler.reloadSchedules();

      const sector = await storage.getSector(schedule.sectorId);
      res.json({
        ...schedule,
        sector: sector ? { id: sector.id, name: sector.name } : null,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/v1/scheduler/sector-schedules/:sectorId", requireAuth, requirePermission("scraper:update"), async (req, res) => {
    try {
      const { sectorId } = req.params;
      const schema = z.object({
        schedule: z.string().optional(),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
      });
      const data = schema.parse(req.body);

      const existing = await storage.getSectorSchedule(sectorId);
      if (!existing) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Convert time to cron if needed
      let cronSchedule = data.schedule || existing.schedule;
      if (data.schedule && data.schedule.match(/^\d{2}:\d{2}$/)) {
        const [hour, minute] = data.schedule.split(":");
        cronSchedule = `${minute} ${hour} * * *`;
      }

      const schedule = await storage.upsertSectorSchedule({
        sectorId,
        schedule: cronSchedule,
        enabled: data.enabled !== undefined ? data.enabled : existing.enabled,
        description: data.description !== undefined ? data.description : existing.description,
      });

      // Reload scheduler with new settings
      const { scrapingScheduler } = await import("./scheduler");
      await scrapingScheduler.reloadSchedules();

      const sector = await storage.getSector(schedule.sectorId);
      res.json({
        ...schedule,
        sector: sector ? { id: sector.id, name: sector.name } : null,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/v1/scheduler/sector-schedules/:id", requireAuth, requirePermission("scraper:update"), async (req, res) => {
    try {
      await storage.deleteSectorSchedule(req.params.id);
      
      // Reload scheduler with new settings
      const { scrapingScheduler } = await import("./scheduler");
      await scrapingScheduler.reloadSchedules();

      res.json({ success: true });
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

  // Calculate signals for all companies in a sector
  app.post("/api/v1/signals/calculate-sector", requireAuth, requirePermission("signals:create"), async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        sectorId: z.string().min(1),
      });
      const { sectorId } = schema.parse(req.body);

      // Get all companies in this sector
      const companies = await storage.getCompaniesBySector(sectorId);

      if (companies.length === 0) {
        return res.status(404).json({ error: "No companies found in this sector" });
      }

      const { signals: signalsTable, formulas } = await import("@shared/schema");
      let mainFormula = await db.select().from(formulas).where(eq(formulas.name, "Main Signal Formula")).limit(1);

      if (mainFormula.length === 0) {
        // Create the main signal formula
        const [newFormula] = await db.insert(formulas).values({
          name: "Main Signal Formula",
          condition: "Main signal evaluation based on quarterly metrics",
          signal: "BUY",
          enabled: true,
          priority: 0,
          scope: "global",
        }).returning();
        mainFormula = [newFormula];
      }

      const mainFormulaId = mainFormula[0].id;
      const results: Array<{ ticker: string; signal: string; error?: string }> = [];

      for (const company of companies) {
        try {
          const signal = await evaluateMainSignalForCompany(company.ticker);

          // Delete existing main signals for this company
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
        sectorId,
        processed: companies.length,
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
  // Get formula evaluation trace (detailed step-by-step evaluation)
  app.post("/api/v1/formulas/evaluate-trace", requireAuth, requirePermission("formulas:read"), async (req, res) => {
    try {
      const schema = z.object({
        ticker: z.string().min(1),
        formula: z.string().min(1),
        selectedQuarters: z.array(z.string()).optional(),
      });
      const { ticker, formula, selectedQuarters } = schema.parse(req.body);

      // evaluateExcelFormulaForCompany with collectTrace=true returns { result, resultType, usedQuarters, trace }
      const evalResult = await evaluateExcelFormulaForCompany(ticker, formula, selectedQuarters, false, true);

      if (!evalResult.trace) {
        return res.status(500).json({ error: "Failed to collect trace" });
      }

      res.json({
        trace: evalResult.trace,
        result: evalResult.result,
        resultType: evalResult.resultType,
        usedQuarters: evalResult.usedQuarters,
      });
    } catch (error: any) {
      console.error("[TRACE] Error evaluating formula trace:", error);
      res.status(400).json({ error: error.message || "Failed to evaluate formula trace" });
    }
  });

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

  // Export all companies data as CSV (streaming for large datasets)
  app.get("/api/v1/companies/export", requireAuth, requirePermission("companies:read"), async (req, res) => {
    try {
      const { companies: companiesTable, sectors: sectorsTable, quarterlyData: quarterlyDataTable, signals: signalsTable } = await import("@shared/schema");

      const timestamp = Date.now();
      const fileName = `companies_export_${timestamp}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

      // Helper function to escape CSV values
      const escapeCSV = (value: any): string => {
        if (value === null || value === undefined) {
          return "";
        }
        const str = String(value);
        // If contains comma, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Write CSV header
      res.write("ticker,name,sector_id,sector_name,market_cap,financial_data,quarter,metric_name,metric_value,latest_signal,formula_id\n");

      // Process companies in batches to avoid memory issues and timeout
      const BATCH_SIZE = 50;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        // Fetch batch of companies (ordered for consistent pagination)
        const companiesBatch = await db
          .select({
            id: companiesTable.id,
            ticker: companiesTable.ticker,
            name: companiesTable.name,
            sectorId: companiesTable.sectorId,
            sectorName: sectorsTable.name,
            marketCap: companiesTable.marketCap,
            financialData: companiesTable.financialData,
          })
          .from(companiesTable)
          .leftJoin(sectorsTable, eq(companiesTable.sectorId, sectorsTable.id))
          .orderBy(asc(companiesTable.ticker))
          .limit(BATCH_SIZE)
          .offset(offset);

        if (companiesBatch.length === 0) {
          hasMore = false;
          break;
        }

        const batchCompanyIds = companiesBatch.map(c => c.id);
        const batchTickers = companiesBatch.map(c => c.ticker);

        // Fetch quarterly data for this batch
        let batchQuarterlyData: typeof quarterlyDataTable.$inferSelect[] = [];
        if (batchTickers.length > 0) {
          batchQuarterlyData = await db
            .select()
            .from(quarterlyDataTable)
            .where(inArray(quarterlyDataTable.ticker, batchTickers));
        }

        // Fetch latest signals for this batch
        let batchLatestSignals: Array<{
          companyId: string;
          signal: string;
          formulaId: string;
          updatedAt: Date | null;
        }> = [];
        if (batchCompanyIds.length > 0) {
          const allSignals = await db
            .select({
              companyId: signalsTable.companyId,
              signal: signalsTable.signal,
              formulaId: signalsTable.formulaId,
              updatedAt: signalsTable.updatedAt,
            })
            .from(signalsTable)
            .where(inArray(signalsTable.companyId, batchCompanyIds));
          
          // Filter to get only the latest signal per company (by updatedAt)
          const latestSignalsMap = new Map<string, typeof allSignals[0]>();
          for (const signal of allSignals) {
            const existing = latestSignalsMap.get(signal.companyId);
            if (!existing) {
              latestSignalsMap.set(signal.companyId, signal);
            } else {
              const signalTime = signal.updatedAt ? new Date(signal.updatedAt).getTime() : 0;
              const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
              if (signalTime > existingTime) {
                latestSignalsMap.set(signal.companyId, signal);
              }
            }
          }
          batchLatestSignals = Array.from(latestSignalsMap.values());
        }

        // Create maps for quick lookup
        const signalsMap = new Map(
          batchLatestSignals.map(s => [s.companyId, { signal: s.signal, formulaId: s.formulaId }])
        );

        const quarterlyDataMap = new Map<string, typeof batchQuarterlyData>();
        batchQuarterlyData.forEach(qd => {
          const key = qd.ticker;
          if (!quarterlyDataMap.has(key)) {
            quarterlyDataMap.set(key, []);
          }
          quarterlyDataMap.get(key)!.push(qd);
        });

        // Generate and write CSV rows for this batch
        for (const company of companiesBatch) {
          const ticker = company.ticker;
          const companyInfo = {
            ticker: escapeCSV(ticker),
            name: escapeCSV(company.name),
            sectorId: escapeCSV(company.sectorId || ""),
            sectorName: escapeCSV(company.sectorName || ""),
            marketCap: escapeCSV(company.marketCap || ""),
            financialData: escapeCSV(company.financialData ? JSON.stringify(company.financialData) : ""),
          };

          const companyQuarterlyData = quarterlyDataMap.get(ticker) || [];
          const companySignal = signalsMap.get(company.id);

          if (companyQuarterlyData.length === 0) {
            // Company has no quarterly data - create one row with company info only
            res.write([
              companyInfo.ticker,
              companyInfo.name,
              companyInfo.sectorId,
              companyInfo.sectorName,
              companyInfo.marketCap,
              companyInfo.financialData,
              "", // quarter
              "", // metric_name
              "", // metric_value
              escapeCSV(companySignal?.signal || ""),
              escapeCSV(companySignal?.formulaId || ""),
            ].join(",") + "\n");
          } else {
            // Create one row per quarter-metric combination
            for (const qd of companyQuarterlyData) {
              res.write([
                companyInfo.ticker,
                companyInfo.name,
                companyInfo.sectorId,
                companyInfo.sectorName,
                companyInfo.marketCap,
                companyInfo.financialData,
                escapeCSV(qd.quarter),
                escapeCSV(qd.metricName),
                escapeCSV(qd.metricValue || ""),
                escapeCSV(companySignal?.signal || ""),
                escapeCSV(companySignal?.formulaId || ""),
              ].join(",") + "\n");
            }
          }
        }

        offset += BATCH_SIZE;
        hasMore = companiesBatch.length === BATCH_SIZE; // Continue if we got a full batch
      }

      res.end();
    } catch (error: any) {
      console.error("[EXPORT] Error exporting companies data:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Failed to export companies data" });
      } else {
        res.end();
      }
    }
  });

  // Import companies with data from exported CSV format
  app.post("/api/v1/companies/import-with-data", requireAuth, requirePermission("companies:create"), async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        csvData: z.string(), // CSV content as string
      });
      const { csvData } = schema.parse(req.body);

      const lines = csvData.split("\n").filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(400).json({ error: "CSV is empty" });
      }

      // Parse header
      const header = lines[0].split(",").map(h => h.trim());
      const expectedHeaders = ["ticker", "name", "sector_id", "sector_name", "market_cap", "financial_data", "quarter", "metric_name", "metric_value", "latest_signal", "formula_id"];
      
      // Check if header matches expected format
      if (header.length < 3) {
        return res.status(400).json({ error: "Invalid CSV format. Expected columns: ticker, name, sector_name, ..." });
      }

      // Parse CSV rows (handle quoted fields properly)
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++; // Skip next quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      // Group rows by ticker
      const companiesMap = new Map<string, {
        ticker: string;
        name: string;
        sectorId: string | null;
        sectorName: string;
        marketCap: string | null;
        financialData: any;
        quarterlyData: Array<{
          quarter: string;
          metricName: string;
          metricValue: string | null;
        }>;
      }>();

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 3) continue; // Skip invalid rows

        const ticker = values[0]?.trim();
        if (!ticker) continue;

        if (!companiesMap.has(ticker)) {
          companiesMap.set(ticker, {
            ticker,
            name: values[1]?.trim() || ticker,
            sectorId: values[2]?.trim() || null,
            sectorName: values[3]?.trim() || "",
            marketCap: values[4]?.trim() || null,
            financialData: values[5]?.trim() ? (() => {
              try {
                return JSON.parse(values[5]);
              } catch {
                return null;
              }
            })() : null,
            quarterlyData: [],
          });
        }

        // Add quarterly data if present
        const quarter = values[6]?.trim();
        const metricName = values[7]?.trim();
        const metricValue = values[8]?.trim() || null;

        if (quarter && metricName) {
          const company = companiesMap.get(ticker)!;
          company.quarterlyData.push({ quarter, metricName, metricValue });
        }
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as Array<{ ticker: string; error: string }>,
        importedTickers: [] as string[],
      };

      // Process each company
      for (const [ticker, companyData] of companiesMap.entries()) {
        try {
          // 1. Get or create sector
          let sector = companyData.sectorId 
            ? await storage.getSector(companyData.sectorId)
            : null;
          
          if (!sector && companyData.sectorName) {
            // Try to find by name
            sector = await storage.getSectorByName(companyData.sectorName);
            if (!sector) {
              // Create new sector
              sector = await storage.createSector({
                name: companyData.sectorName,
              });
            }
          }

          if (!sector) {
            throw new Error("Sector is required");
          }

          // 2. Get or create company
          let company = await storage.getCompanyByTickerAndSector(ticker, sector.id);
          
          const companyDataToUpdate: any = {
            name: companyData.name,
            sectorId: sector.id,
          };

          if (companyData.marketCap) {
            companyDataToUpdate.marketCap = companyData.marketCap;
          }

          if (companyData.financialData) {
            companyDataToUpdate.financialData = companyData.financialData;
          }

          if (company) {
            // Update existing company
            company = await storage.updateCompany(company.id, companyDataToUpdate);
          } else {
            // Create new company
            company = await storage.createCompany({
              ticker,
              ...companyDataToUpdate,
            });
          }

          if (!company) {
            throw new Error("Failed to create or update company");
          }

          // 3. Import quarterly data
          if (companyData.quarterlyData.length > 0) {
            const quarterlyDataToInsert = companyData.quarterlyData.map(qd => ({
              ticker: company!.ticker,
              companyId: company!.id,
              quarter: qd.quarter,
              metricName: qd.metricName,
              metricValue: qd.metricValue ? qd.metricValue : null,
              scrapeTimestamp: null, // Will be set to current time by default
            }));

            await storage.bulkCreateQuarterlyData(quarterlyDataToInsert);
          }

          results.success++;
          results.importedTickers.push(ticker);
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            ticker,
            error: error.message || "Unknown error",
          });
          console.error(`[IMPORT] Error importing company ${ticker}:`, error);
        }
      }

      res.json({
        success: results.success > 0,
        imported: results.success,
        failed: results.failed,
        importedTickers: results.importedTickers,
        errors: results.errors,
      });
    } catch (error: any) {
      console.error("[IMPORT] Error importing companies with data:", error);
      res.status(400).json({ error: error.message || "Failed to import companies" });
    }
  });

  // ============================================
  // Settings Endpoints
  // ============================================

  // Get default metrics configuration
  app.get("/api/settings/default-metrics", requireAuth, requirePermission("settings:read"), async (req, res) => {
    try {
      const allMetrics = await getAllMetrics();
      const visibleMetrics = await loadVisibleMetrics();
      
      // Ensure all metrics are in the visible metrics object
      // Start with defaults, then override with saved values
      const metricsConfig: Record<string, boolean> = {};
      allMetrics.forEach(metric => {
        // Use saved value if exists, otherwise use default, otherwise false
        metricsConfig[metric] = visibleMetrics[metric] ?? DEFAULT_VISIBLE_METRICS[metric] ?? false;
      });
      
      // Ensure we have at least the default metrics
      Object.keys(DEFAULT_VISIBLE_METRICS).forEach(metric => {
        if (!(metric in metricsConfig)) {
          metricsConfig[metric] = DEFAULT_VISIBLE_METRICS[metric];
        }
      });
      
      const visibleMetricsList = await getVisibleMetrics();
      
      // Also get banking metrics and order
      const { 
        loadBankingMetrics, 
        getVisibleBankingMetrics, 
        DEFAULT_BANKING_METRICS,
        loadMetricsOrder,
        loadBankingMetricsOrder,
        getOrderedVisibleMetrics,
        getOrderedVisibleBankingMetrics
      } = await import("./settingsManager");
      const bankingMetrics = await loadBankingMetrics();
      const visibleBankingMetrics = await getVisibleBankingMetrics();
      
      // Get metric orders
      const metricsOrder = await loadMetricsOrder();
      const bankingMetricsOrder = await loadBankingMetricsOrder();
      
      // Get ordered visible metrics
      const orderedVisibleMetrics = await getOrderedVisibleMetrics();
      const orderedVisibleBankingMetrics = await getOrderedVisibleBankingMetrics();
      
      res.json({
        metrics: metricsConfig,
        visibleMetrics: visibleMetricsList,
        bankingMetrics,
        visibleBankingMetrics,
        metricsOrder,
        bankingMetricsOrder,
        orderedVisibleMetrics,
        orderedVisibleBankingMetrics
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update default metrics configuration
  app.put("/api/settings/default-metrics", requireAuth, requirePermission("settings:write"), async (req, res) => {
    try {
      const schema = z.object({
        metrics: z.record(z.string(), z.boolean()).optional(),
        bankingMetrics: z.record(z.string(), z.boolean()).optional(),
        metricsOrder: z.array(z.string()).optional(),
        bankingMetricsOrder: z.array(z.string()).optional()
      });
      const { metrics, bankingMetrics, metricsOrder, bankingMetricsOrder } = schema.parse(req.body);
      
      let defaultSuccess = true;
      let bankingSuccess = true;
      let orderSuccess = true;
      let bankingOrderSuccess = true;
      
      if (metrics !== undefined) {
        defaultSuccess = await saveVisibleMetrics(metrics);
      }
      
      if (bankingMetrics !== undefined) {
        try {
          const { saveBankingMetrics } = await import("./settingsManager");
          bankingSuccess = await saveBankingMetrics(bankingMetrics);
        } catch (bankingError: any) {
          console.error("Error saving banking metrics in route handler:", bankingError);
          console.error("Banking metrics data:", JSON.stringify(bankingMetrics, null, 2));
          bankingSuccess = false;
          // Include error details in response
          return res.status(500).json({ 
            error: "Failed to save banking metrics configuration",
            details: bankingError?.message || String(bankingError)
          });
        }
      }
      
      // Save metrics order if provided
      if (metricsOrder !== undefined) {
        try {
          const { saveMetricsOrder } = await import("./settingsManager");
          orderSuccess = await saveMetricsOrder(metricsOrder);
        } catch (orderError: any) {
          console.error("Error saving metrics order:", orderError);
          orderSuccess = false;
        }
      }
      
      // Save banking metrics order if provided
      if (bankingMetricsOrder !== undefined) {
        try {
          const { saveBankingMetricsOrder } = await import("./settingsManager");
          bankingOrderSuccess = await saveBankingMetricsOrder(bankingMetricsOrder);
        } catch (orderError: any) {
          console.error("Error saving banking metrics order:", orderError);
          bankingOrderSuccess = false;
        }
      }
      
      if (defaultSuccess && bankingSuccess && orderSuccess && bankingOrderSuccess) {
        const { 
          loadBankingMetrics, 
          getVisibleBankingMetrics,
          loadMetricsOrder,
          loadBankingMetricsOrder,
          getOrderedVisibleMetrics,
          getOrderedVisibleBankingMetrics
        } = await import("./settingsManager");
        const savedBankingMetrics = await loadBankingMetrics();
        const visibleBankingMetrics = await getVisibleBankingMetrics();
        const savedMetricsOrder = await loadMetricsOrder();
        const savedBankingMetricsOrder = await loadBankingMetricsOrder();
        const orderedVisibleMetrics = await getOrderedVisibleMetrics();
        const orderedVisibleBankingMetrics = await getOrderedVisibleBankingMetrics();
        
        res.json({ 
          success: true, 
          message: "Metrics configuration updated successfully",
          metrics: metrics || undefined,
          bankingMetrics: bankingMetrics || savedBankingMetrics,
          visibleBankingMetrics,
          metricsOrder: savedMetricsOrder,
          bankingMetricsOrder: savedBankingMetricsOrder,
          orderedVisibleMetrics,
          orderedVisibleBankingMetrics
        });
      } else {
        res.status(500).json({ error: "Failed to save metrics configuration" });
      }
    } catch (error: any) {
      console.error("Error in PUT /api/settings/default-metrics:", error);
      console.error("Error stack:", error?.stack);
      res.status(400).json({ error: error.message || "Failed to save metrics configuration" });
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
        // Get dataType from job settings or default to 'consolidated'
        const job = await storage.getBulkImportJob(jobId);
        const dataType = (job?.metadata as any)?.dataType || 'consolidated';
        
        const scrapeResult = await scraper.scrapeCompany(
          company.ticker,
          company.id,
          sector.id, // Use sector.id as sectorOverride to preserve the sector
          undefined, // userId
          dataType as 'consolidated' | 'standalone' | 'both'
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
