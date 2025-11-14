import { db } from "./db";
import { users, sectors, companies, formulas, signals } from "@shared/schema";
import { hashPassword } from "./auth";

async function seed() {
  console.log("🌱 Seeding database...");

  // Create admin user
  const adminPassword = await hashPassword("admin123");
  const [admin] = await db.insert(users).values({
    email: "admin@finanalytics.com",
    password: adminPassword,
    name: "Admin User",
    role: "admin",
    otpEnabled: false
  }).returning();
  console.log("✅ Created admin user");

  // Create analyst user
  const analystPassword = await hashPassword("analyst123");
  await db.insert(users).values({
    email: "analyst@finanalytics.com",
    password: analystPassword,
    name: "Analyst User",
    role: "analyst",
    otpEnabled: false
  }).returning();
  console.log("✅ Created analyst user");

  // Create sectors
  const sectorData = [
    { name: "Technology", description: "Technology and software companies" },
    { name: "Healthcare", description: "Healthcare and pharmaceutical companies" },
    { name: "Finance", description: "Banking and financial services" },
    { name: "Energy", description: "Energy and utilities companies" },
    { name: "Consumer", description: "Consumer goods and services" },
    { name: "Industrial", description: "Industrial and manufacturing companies" }
  ];

  const createdSectors = await db.insert(sectors).values(sectorData).returning();
  console.log(`✅ Created ${createdSectors.length} sectors`);

  // Create companies
  const techSector = createdSectors.find(s => s.name === "Technology")!;
  const healthSector = createdSectors.find(s => s.name === "Healthcare")!;
  const financeSector = createdSectors.find(s => s.name === "Finance")!;
  const energySector = createdSectors.find(s => s.name === "Energy")!;
  const consumerSector = createdSectors.find(s => s.name === "Consumer")!;

  const companyData = [
    {
      ticker: "AAPL",
      name: "Apple Inc.",
      sectorId: techSector.id,
      marketCap: "2800000000000",
      financialData: {
        revenue: 394328000000,
        netIncome: 96995000000,
        totalAssets: 352755000000,
        totalDebt: 111088000000,
        peRatio: 28.5,
        roe: 0.275,
        debtToEquity: 1.96
      }
    },
    {
      ticker: "MSFT",
      name: "Microsoft Corporation",
      sectorId: techSector.id,
      marketCap: "2750000000000",
      financialData: {
        revenue: 211915000000,
        netIncome: 72738000000,
        totalAssets: 411976000000,
        totalDebt: 79296000000,
        peRatio: 32.1,
        roe: 0.388,
        debtToEquity: 0.42
      }
    },
    {
      ticker: "GOOGL",
      name: "Alphabet Inc.",
      sectorId: techSector.id,
      marketCap: "1650000000000",
      financialData: {
        revenue: 307394000000,
        netIncome: 73795000000,
        totalAssets: 402392000000,
        totalDebt: 28478000000,
        peRatio: 23.8,
        roe: 0.296,
        debtToEquity: 0.11
      }
    },
    {
      ticker: "JNJ",
      name: "Johnson & Johnson",
      sectorId: healthSector.id,
      marketCap: "385000000000",
      financialData: {
        revenue: 85159000000,
        netIncome: 17941000000,
        totalAssets: 187378000000,
        totalDebt: 33416000000,
        peRatio: 21.5,
        roe: 0.231,
        debtToEquity: 0.48
      }
    },
    {
      ticker: "PFE",
      name: "Pfizer Inc.",
      sectorId: healthSector.id,
      marketCap: "162000000000",
      financialData: {
        revenue: 58496000000,
        netIncome: 11255000000,
        totalAssets: 197205000000,
        totalDebt: 61882000000,
        peRatio: 14.4,
        roe: 0.135,
        debtToEquity: 0.54
      }
    },
    {
      ticker: "JPM",
      name: "JPMorgan Chase & Co.",
      sectorId: financeSector.id,
      marketCap: "450000000000",
      financialData: {
        revenue: 158100000000,
        netIncome: 49552000000,
        totalAssets: 3875000000000,
        totalDebt: 353500000000,
        peRatio: 9.1,
        roe: 0.168,
        debtToEquity: 1.36
      }
    },
    {
      ticker: "XOM",
      name: "Exxon Mobil Corporation",
      sectorId: energySector.id,
      marketCap: "415000000000",
      financialData: {
        revenue: 344582000000,
        netIncome: 55740000000,
        totalAssets: 376317000000,
        totalDebt: 46737000000,
        peRatio: 7.4,
        roe: 0.247,
        debtToEquity: 0.27
      }
    },
    {
      ticker: "TSLA",
      name: "Tesla Inc.",
      sectorId: consumerSector.id,
      marketCap: "695000000000",
      financialData: {
        revenue: 96773000000,
        netIncome: 14997000000,
        totalAssets: 106618000000,
        totalDebt: 9570000000,
        peRatio: 46.3,
        roe: 0.282,
        debtToEquity: 0.16
      }
    }
  ];

  const createdCompanies = await db.insert(companies).values(companyData).returning();
  console.log(`✅ Created ${createdCompanies.length} companies`);

  // Create formulas
  const formulaData = [
    {
      name: "High ROE",
      scope: "global",
      scopeValue: null,
      condition: "roe > 0.20",
      signal: "BUY",
      priority: 1,
      enabled: true
    },
    {
      name: "Low Debt",
      scope: "global",
      scopeValue: null,
      condition: "debtToEquity < 0.5",
      signal: "BUY",
      priority: 2,
      enabled: true
    },
    {
      name: "Value Stock",
      scope: "global",
      scopeValue: null,
      condition: "peRatio < 15",
      signal: "BUY",
      priority: 3,
      enabled: true
    },
    {
      name: "Overvalued Stock",
      scope: "global",
      scopeValue: null,
      condition: "peRatio > 40",
      signal: "SELL",
      priority: 4,
      enabled: true
    },
    {
      name: "Tech Growth",
      scope: "sector",
      scopeValue: "Technology",
      condition: "roe > 0.25 AND peRatio > 20",
      signal: "BUY",
      priority: 10,
      enabled: true
    }
  ];

  const createdFormulas = await db.insert(formulas).values(formulaData).returning();
  console.log(`✅ Created ${createdFormulas.length} formulas`);

  // Generate signals
  const signalData = [];
  const highROEFormula = createdFormulas.find(f => f.name === "High ROE")!;
  const lowDebtFormula = createdFormulas.find(f => f.name === "Low Debt")!;
  const valueFormula = createdFormulas.find(f => f.name === "Value Stock")!;

  for (const company of createdCompanies) {
    const data = company.financialData as any;
    
    // High ROE signals
    if (data.roe > 0.20) {
      signalData.push({
        companyId: company.id,
        formulaId: highROEFormula.id,
        signal: "BUY",
        value: String(data.roe),
        metadata: { formula: "High ROE", threshold: 0.20 }
      });
    }

    // Low Debt signals
    if (data.debtToEquity < 0.5) {
      signalData.push({
        companyId: company.id,
        formulaId: lowDebtFormula.id,
        signal: "BUY",
        value: String(data.debtToEquity),
        metadata: { formula: "Low Debt", threshold: 0.5 }
      });
    }

    // Value Stock signals
    if (data.peRatio < 15) {
      signalData.push({
        companyId: company.id,
        formulaId: valueFormula.id,
        signal: "BUY",
        value: String(data.peRatio),
        metadata: { formula: "Value Stock", threshold: 15 }
      });
    } else if (data.peRatio > 40) {
      signalData.push({
        companyId: company.id,
        formulaId: valueFormula.id,
        signal: "SELL",
        value: String(data.peRatio),
        metadata: { formula: "Value Stock", threshold: 40 }
      });
    } else {
      signalData.push({
        companyId: company.id,
        formulaId: valueFormula.id,
        signal: "HOLD",
        value: String(data.peRatio),
        metadata: { formula: "Value Stock" }
      });
    }
  }

  await db.insert(signals).values(signalData);
  console.log(`✅ Created ${signalData.length} signals`);

  console.log("\n🎉 Database seeded successfully!");
  console.log("\n📝 Login credentials:");
  console.log("   Admin: admin@finanalytics.com / admin123");
  console.log("   Analyst: analyst@finanalytics.com / analyst123");
}

seed().catch(console.error).finally(() => process.exit());
