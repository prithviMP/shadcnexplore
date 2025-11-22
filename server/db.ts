import "dotenv/config";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Check if using Neon (has neon.tech in URL) or local PostgreSQL
const isNeon = process.env.DATABASE_URL.includes("neon.tech") || process.env.DATABASE_URL.includes("neon");

// Initialize database connection
let db: any;

async function initDb() {
  if (db) return db;
  
  if (isNeon) {
    // Use Neon serverless driver for Neon databases
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const { neonConfig, Pool } = await import("@neondatabase/serverless");
    const ws = await import("ws");
    
    neonConfig.webSocketConstructor = ws.default;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle({ client: pool, schema });
  } else {
    // Use regular pg driver for local PostgreSQL
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle({ client: pool, schema });
  }
  
  return db;
}

// Initialize synchronously for immediate use
db = await initDb();

export { db };
