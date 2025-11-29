import "dotenv/config";
import { db } from "./db";
import { users, sectors, companies, formulas, signals } from "@shared/schema";
import { hashPassword } from "./auth";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database with Indian companies...");

  // Create admin user (only if doesn't exist)
  const existingAdmin = await db.select().from(users).where(eq(users.email, "admin@finanalytics.com")).limit(1);
  if (existingAdmin.length === 0) {
  const adminPassword = await hashPassword("admin123");
  const [admin] = await db.insert(users).values({
    email: "admin@finanalytics.com",
    password: adminPassword,
    name: "Admin User",
    role: "admin",
    otpEnabled: false
  }).returning();
  console.log("✅ Created admin user");
  } else {
    console.log("ℹ️  Admin user already exists, skipping...");
  }

  // Create analyst user (only if doesn't exist)
  const existingAnalyst = await db.select().from(users).where(eq(users.email, "analyst@finanalytics.com")).limit(1);
  if (existingAnalyst.length === 0) {
  const analystPassword = await hashPassword("analyst123");
  await db.insert(users).values({
    email: "analyst@finanalytics.com",
    password: analystPassword,
    name: "Analyst User",
    role: "analyst",
    otpEnabled: false
  }).returning();
  console.log("✅ Created analyst user");
  } else {
    console.log("ℹ️  Analyst user already exists, skipping...");
  }

  // Create sectors (Indian market sectors)
  const sectorData = [
    { name: "Information Technology", description: "IT services and software companies" },
    { name: "Banking", description: "Banks and financial services" },
    { name: "Oil & Gas", description: "Oil, gas and energy companies" },
    { name: "Pharmaceuticals", description: "Pharmaceutical and healthcare companies" },
    { name: "Consumer Goods", description: "FMCG and consumer products" },
    { name: "Automobile", description: "Automobile manufacturers" },
    { name: "Telecommunications", description: "Telecom services" },
    { name: "Metals & Mining", description: "Metals and mining companies" },
    { name: "Cement", description: "Cement and construction materials" },
    { name: "Power", description: "Power generation and distribution" }
  ];

  // Check existing sectors and only insert new ones
  const existingSectors = await db.select().from(sectors);
  const existingSectorNames = new Set(existingSectors.map((s: any) => s.name));
  const sectorsToInsert = sectorData.filter((s: any) => !existingSectorNames.has(s.name));
  
  let createdSectors = existingSectors;
  if (sectorsToInsert.length > 0) {
    const newSectors = await db.insert(sectors).values(sectorsToInsert).returning();
    createdSectors = [...existingSectors, ...newSectors];
    console.log(`✅ Created ${newSectors.length} new sectors`);
  } else {
    console.log(`ℹ️  All sectors already exist, skipping...`);
  }

  // Create Indian companies (using actual NSE/BSE tickers from Screener.in)
  const itSector = createdSectors.find((s: any) => s.name === "Information Technology")!;
  const bankingSector = createdSectors.find((s: any) => s.name === "Banking")!;
  const oilGasSector = createdSectors.find((s: any) => s.name === "Oil & Gas")!;
  const pharmaSector = createdSectors.find((s: any) => s.name === "Pharmaceuticals")!;
  const consumerSector = createdSectors.find((s: any) => s.name === "Consumer Goods")!;
  const autoSector = createdSectors.find((s: any) => s.name === "Automobile")!;
  const telecomSector = createdSectors.find((s: any) => s.name === "Telecommunications")!;
  const metalsSector = createdSectors.find((s: any) => s.name === "Metals & Mining")!;

  const companyData = [
    {
      ticker: "RELIANCE",
      name: "Reliance Industries Ltd",
      sectorId: oilGasSector.id,
      marketCap: "17000000000000", // ~17 lakh crores
      financialData: {
        revenue: 8000000000000, // 8 lakh crores
        netIncome: 700000000000, // 70,000 crores
        peRatio: 24.3,
        roe: 0.12,
        debtToEquity: 0.45
      }
    },
    {
      ticker: "TCS",
      name: "Tata Consultancy Services Ltd",
      sectorId: itSector.id,
      marketCap: "13000000000000", // ~13 lakh crores
      financialData: {
        revenue: 2000000000000, // 2 lakh crores
        netIncome: 450000000000, // 45,000 crores
        peRatio: 28.9,
        roe: 0.35,
        debtToEquity: 0.05
      }
    },
    {
      ticker: "HDFCBANK",
      name: "HDFC Bank Ltd",
      sectorId: bankingSector.id,
      marketCap: "11000000000000", // ~11 lakh crores
      financialData: {
        revenue: 1800000000000, // 1.8 lakh crores
        netIncome: 500000000000, // 50,000 crores
        peRatio: 22.0,
        roe: 0.18,
        debtToEquity: 0.0 // Banks have different debt structure
      }
    },
    {
      ticker: "INFY",
      name: "Infosys Ltd",
      sectorId: itSector.id,
      marketCap: "7000000000000", // ~7 lakh crores
      financialData: {
        revenue: 1500000000000, // 1.5 lakh crores
        netIncome: 300000000000, // 30,000 crores
        peRatio: 23.4,
        roe: 0.28,
        debtToEquity: 0.02
      }
    },
    {
      ticker: "ICICIBANK",
      name: "ICICI Bank Ltd",
      sectorId: bankingSector.id,
      marketCap: "7000000000000", // ~7 lakh crores
      financialData: {
        revenue: 1200000000000, // 1.2 lakh crores
        netIncome: 350000000000, // 35,000 crores
        peRatio: 20.0,
        roe: 0.16,
        debtToEquity: 0.0
      }
    },
    {
      ticker: "BHARTIARTL",
      name: "Bharti Airtel Ltd",
      sectorId: telecomSector.id,
      marketCap: "6500000000000", // ~6.5 lakh crores
      financialData: {
        revenue: 1200000000000, // 1.2 lakh crores
        netIncome: 150000000000, // 15,000 crores
        peRatio: 43.3,
        roe: 0.08,
        debtToEquity: 1.2
      }
    },
    {
      ticker: "SBIN",
      name: "State Bank of India",
      sectorId: bankingSector.id,
      marketCap: "6000000000000", // ~6 lakh crores
      financialData: {
        revenue: 3000000000000, // 3 lakh crores
        netIncome: 600000000000, // 60,000 crores
        peRatio: 10.0,
        roe: 0.20,
        debtToEquity: 0.0
      }
    },
    {
      ticker: "HINDUNILVR",
      name: "Hindustan Unilever Ltd",
      sectorId: consumerSector.id,
      marketCap: "5500000000000", // ~5.5 lakh crores
      financialData: {
        revenue: 550000000000, // 55,000 crores
        netIncome: 95000000000, // 9,500 crores
        peRatio: 58.0,
        roe: 0.17,
        debtToEquity: 0.0
      }
    },
    {
      ticker: "ITC",
      name: "ITC Ltd",
      sectorId: consumerSector.id,
      marketCap: "5000000000000", // ~5 lakh crores
      financialData: {
        revenue: 700000000000, // 70,000 crores
        netIncome: 180000000000, // 18,000 crores
        peRatio: 27.8,
        roe: 0.26,
        debtToEquity: 0.0
      }
    },
    {
      ticker: "MARUTI",
      name: "Maruti Suzuki India Ltd",
      sectorId: autoSector.id,
      marketCap: "3500000000000", // ~3.5 lakh crores
      financialData: {
        revenue: 1200000000000, // 1.2 lakh crores
        netIncome: 90000000000, // 9,000 crores
        peRatio: 38.9,
        roe: 0.12,
        debtToEquity: 0.0
      }
    },
    {
      ticker: "SUNPHARMA",
      name: "Sun Pharmaceutical Industries Ltd",
      sectorId: pharmaSector.id,
      marketCap: "3000000000000", // ~3 lakh crores
      financialData: {
        revenue: 450000000000, // 45,000 crores
        netIncome: 85000000000, // 8,500 crores
        peRatio: 35.3,
        roe: 0.15,
        debtToEquity: 0.08
      }
    },
    {
      ticker: "TATAMOTORS",
      name: "Tata Motors Ltd",
      sectorId: autoSector.id,
      marketCap: "3200000000000", // ~3.2 lakh crores
      financialData: {
        revenue: 3500000000000, // 3.5 lakh crores
        netIncome: 300000000000, // 30,000 crores
        peRatio: 10.7,
        roe: 0.25,
        debtToEquity: 0.6
      }
    }
  ];

  // Check existing companies and only insert new ones (by ticker)
  const existingCompanies = await db.select().from(companies);
  const existingTickers = new Set(existingCompanies.map((c: any) => c.ticker));
  const companiesToInsert = companyData.filter((c: any) => !existingTickers.has(c.ticker));
  
  let createdCompanies = existingCompanies;
  if (companiesToInsert.length > 0) {
    const newCompanies = await db.insert(companies).values(companiesToInsert).returning();
    createdCompanies = [...existingCompanies, ...newCompanies];
    console.log(`✅ Created ${newCompanies.length} new Indian companies`);
  } else {
    console.log(`ℹ️  All companies already exist, skipping...`);
    // Use existing companies for signal generation
    createdCompanies = existingCompanies.slice(0, companyData.length);
  }

  // Main Signal Formula (Excel formula for quarterly data)
  const mainSignalFormula = `IF(
OR(
  NOT(ISNUMBER(Q12)), NOT(ISNUMBER(Q13)), NOT(ISNUMBER(Q14)), NOT(ISNUMBER(Q15)), NOT(ISNUMBER(Q16)),
  NOT(ISNUMBER(P12)), NOT(ISNUMBER(P13)), NOT(ISNUMBER(P14)), NOT(ISNUMBER(P15)), NOT(ISNUMBER(P16))
),
"No Signal",
IF(
  AND(
    Q14>0,
    P14>0,
    Q12>=20%,
    Q15>=20%,
    OR(
      AND(MIN(Q13,Q16)>=5%, OR(Q13>=10%, Q16>=10%)),
      AND(Q16>=5%, Q16<10%, Q13>=100%),
      AND(Q13<0, Q16>=10%)
    ),
    AND(
      P12>=10%,
      OR(
        AND(P13>0, P15>0),
        AND(P13>0, P16>0),
        AND(P15>0, P16>0)
      )
    ),
    OR(P16>=0, P13>=10%),
    OR(P13>=0, P16>=10%),
    OR(
      P15>=0,
      AND(P15<0, Q13>=0, Q16>=0)
    )
  ),
  "BUY",
  IF(
    OR(
      AND(P13<10%, Q13<10%, Q15<P15, Q16<P16),
      AND(Q13<0, Q16<0),
      AND(Q16<0, Q15<0, OR(Q13<0, Q12<10%)),
      AND(
        OR(Q13<5%, Q16<5%),
        OR(
          IF(ABS(P12)>0, (Q12 - P12)/ABS(P12) <= -15%, Q12<0),
          IF(ABS(P15)>0, (Q15 - P15)/ABS(P15) <= -15%, Q15<0)
        )
      ),
      AND(Q12<20%, Q13<5%)
    ),
    "Check_OPM (Sell)",
    "No Signal"
  )
)
)`;

  // Create formulas
  const formulaData = [
    {
      name: "Main Signal Formula",
      scope: "global",
      scopeValue: null,
      condition: mainSignalFormula,
      signal: "BUY", // Default, but formula returns actual signal
      priority: 0, // Highest priority
      enabled: true,
      formulaType: "excel"
    },
    {
      name: "High ROE",
      scope: "global",
      scopeValue: null,
      condition: "roe > 0.20",
      signal: "BUY",
      priority: 1,
      enabled: true,
      formulaType: "simple"
    },
    {
      name: "Low Debt",
      scope: "global",
      scopeValue: null,
      condition: "debtToEquity < 0.5",
      signal: "BUY",
      priority: 2,
      enabled: true,
      formulaType: "simple"
    },
    {
      name: "Value Stock",
      scope: "global",
      scopeValue: null,
      condition: "peRatio < 15",
      signal: "BUY",
      priority: 3,
      enabled: true,
      formulaType: "simple"
    },
    {
      name: "Overvalued Stock",
      scope: "global",
      scopeValue: null,
      condition: "peRatio > 40",
      signal: "SELL",
      priority: 4,
      enabled: true,
      formulaType: "simple"
    },
    {
      name: "IT Growth",
      scope: "sector",
      scopeValue: "Information Technology",
      condition: "roe > 0.25 AND peRatio > 20",
      signal: "BUY",
      priority: 10,
      enabled: true,
      formulaType: "simple"
    }
  ];

  // Check existing formulas and only insert new ones (by name)
  const existingFormulas = await db.select().from(formulas);
  const existingFormulaNames = new Set(existingFormulas.map((f: any) => f.name));
  const formulasToInsert = formulaData.filter((f: any) => !existingFormulaNames.has(f.name));
  
  let createdFormulas = existingFormulas;
  if (formulasToInsert.length > 0) {
    const newFormulas = await db.insert(formulas).values(formulasToInsert).returning();
    createdFormulas = [...existingFormulas, ...newFormulas];
    console.log(`✅ Created ${newFormulas.length} new formulas`);
  } else {
    console.log(`ℹ️  All formulas already exist, skipping...`);
  }
  
  // Ensure Main Signal Formula exists and is enabled with priority 0
  const mainSignalFormulaRecord = createdFormulas.find((f: any) => f.name === "Main Signal Formula");
  if (mainSignalFormulaRecord) {
    await db.update(formulas)
      .set({ 
        enabled: true, 
        priority: 0, 
        formulaType: "excel",
        condition: mainSignalFormula
      })
      .where(eq(formulas.id, mainSignalFormulaRecord.id));
    console.log(`✅ Updated Main Signal Formula`);
  } else {
    // Insert Main Signal Formula if it doesn't exist
    const [newMainFormula] = await db.insert(formulas).values({
      name: "Main Signal Formula",
      scope: "global",
      scopeValue: null,
      condition: mainSignalFormula,
      signal: "BUY",
      priority: 0,
      enabled: true,
      formulaType: "excel"
    }).returning();
    createdFormulas.push(newMainFormula);
    console.log(`✅ Created Main Signal Formula`);
  }

  // Generate signals
  const signalData = [];
  const highROEFormula = createdFormulas.find((f: any) => f.name === "High ROE");
  const lowDebtFormula = createdFormulas.find((f: any) => f.name === "Low Debt");
  const valueFormula = createdFormulas.find((f: any) => f.name === "Value Stock");

  for (const company of createdCompanies) {
    const data = (company as any).financialData as any;
    
    // High ROE signals
    if (highROEFormula && data && data.roe > 0.20) {
      signalData.push({
        companyId: (company as any).id,
        formulaId: (highROEFormula as any).id,
        signal: "BUY",
        value: String(data.roe),
        metadata: { formula: "High ROE", threshold: 0.20 }
      });
    }

    // Low Debt signals
    if (lowDebtFormula && data && data.debtToEquity < 0.5) {
      signalData.push({
        companyId: (company as any).id,
        formulaId: (lowDebtFormula as any).id,
        signal: "BUY",
        value: String(data.debtToEquity),
        metadata: { formula: "Low Debt", threshold: 0.5 }
      });
    }

    // Value Stock signals
    if (valueFormula && data) {
    if (data.peRatio < 15) {
      signalData.push({
          companyId: (company as any).id,
          formulaId: (valueFormula as any).id,
        signal: "BUY",
        value: String(data.peRatio),
        metadata: { formula: "Value Stock", threshold: 15 }
      });
    } else if (data.peRatio > 40) {
      signalData.push({
          companyId: (company as any).id,
          formulaId: (valueFormula as any).id,
        signal: "SELL",
        value: String(data.peRatio),
        metadata: { formula: "Value Stock", threshold: 40 }
      });
    } else {
      signalData.push({
          companyId: (company as any).id,
          formulaId: (valueFormula as any).id,
        signal: "HOLD",
        value: String(data.peRatio),
        metadata: { formula: "Value Stock" }
      });
      }
    }
  }

  await db.insert(signals).values(signalData);
  console.log(`✅ Created ${signalData.length} signals`);

  console.log("\n🎉 Database seeded successfully with Indian companies!");
  console.log("\n📝 Login credentials:");
  console.log("   Admin: admin@finanalytics.com / admin123");
  console.log("   Analyst: analyst@finanalytics.com / analyst123");
  console.log("\n📊 Seeded companies:");
  console.log("   - RELIANCE (Reliance Industries)");
  console.log("   - TCS (Tata Consultancy Services)");
  console.log("   - HDFCBANK (HDFC Bank)");
  console.log("   - INFY (Infosys)");
  console.log("   - ICICIBANK (ICICI Bank)");
  console.log("   - BHARTIARTL (Bharti Airtel)");
  console.log("   - SBIN (State Bank of India)");
  console.log("   - HINDUNILVR (Hindustan Unilever)");
  console.log("   - ITC (ITC Ltd)");
  console.log("   - MARUTI (Maruti Suzuki)");
  console.log("   - SUNPHARMA (Sun Pharmaceutical)");
  console.log("   - TATAMOTORS (Tata Motors)");
}

seed().catch(console.error).finally(() => process.exit());
