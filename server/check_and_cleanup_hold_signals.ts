/**
 * Script to check and clean up "HOLD" signals that shouldn't exist
 * This script identifies signals with value "HOLD" and helps diagnose where they're coming from
 */

import "dotenv/config";
import { db } from "./db";
import { signals, formulas, companies } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

async function checkAndCleanupHoldSignals() {
  console.log("=".repeat(80));
  console.log("CHECKING FOR HOLD SIGNALS");
  console.log("=".repeat(80));
  console.log();

  try {
    // 1. Find all signals with "HOLD" value
    const holdSignals = await db
      .select({
        signal: signals.signal,
        companyId: signals.companyId,
        formulaId: signals.formulaId,
        companyTicker: companies.ticker,
        formulaName: formulas.name,
        formulaCondition: formulas.condition,
        createdAt: signals.createdAt,
        updatedAt: signals.updatedAt,
      })
      .from(signals)
      .leftJoin(companies, eq(signals.companyId, companies.id))
      .leftJoin(formulas, eq(signals.formulaId, formulas.id))
      .where(eq(signals.signal, "HOLD"));

    console.log(`Found ${holdSignals.length} signals with "HOLD" value\n`);

    if (holdSignals.length === 0) {
      console.log("✓ No HOLD signals found in database. All clear!");
      return;
    }

    // 2. Analyze where HOLD signals are coming from
    console.log("ANALYSIS:");
    console.log("-".repeat(80));

    const holdByFormula: Record<string, { count: number; companies: string[] }> = {};
    const orphanedHolds: Array<{ companyId: string; ticker: string | null }> = [];

    for (const holdSignal of holdSignals) {
      if (holdSignal.formulaId && holdSignal.formulaName) {
        const key = `${holdSignal.formulaName} (${holdSignal.formulaId})`;
        if (!holdByFormula[key]) {
          holdByFormula[key] = { count: 0, companies: [] };
        }
        holdByFormula[key].count++;
        if (holdSignal.companyTicker) {
          holdByFormula[key].companies.push(holdSignal.companyTicker);
        }
      } else {
        orphanedHolds.push({
          companyId: holdSignal.companyId,
          ticker: holdSignal.companyTicker,
        });
      }
    }

    // 3. Check if formulas actually contain "HOLD" in their conditions
    console.log("\n📋 HOLD Signals by Formula:");
    for (const [formulaName, data] of Object.entries(holdByFormula)) {
      const signal = holdSignals.find(
        (s) => s.formulaName && formulaName.includes(s.formulaName)
      );
      const hasHoldInCondition = signal?.formulaCondition
        ?.toUpperCase()
        .includes('"HOLD"') || signal?.formulaCondition?.includes("HOLD");

      console.log(`\n  Formula: ${formulaName}`);
      console.log(`    Count: ${data.count} companies`);
      console.log(`    Companies: ${data.companies.slice(0, 5).join(", ")}${
        data.companies.length > 5 ? ` ... (${data.companies.length} total)` : ""
      }`);
      console.log(
        `    Has "HOLD" in condition: ${hasHoldInCondition ? "YES ⚠️" : "NO ❌"}`
      );
      if (signal?.formulaCondition) {
        const conditionPreview = signal.formulaCondition.slice(0, 100);
        console.log(`    Condition preview: ${conditionPreview}${signal.formulaCondition.length > 100 ? "..." : ""}`);
      }
    }

    if (orphanedHolds.length > 0) {
      console.log(`\n⚠️  Found ${orphanedHolds.length} orphaned HOLD signals (no formula found)`);
      console.log(
        `   Companies: ${orphanedHolds
          .slice(0, 10)
          .map((o) => o.ticker || o.companyId)
          .join(", ")}${orphanedHolds.length > 10 ? "..." : ""}`
      );
    }

    // 4. Check if any formulas have "HOLD" hardcoded
    console.log("\n\n📝 Checking all formulas for 'HOLD' references:");
    const allFormulas = await db.select().from(formulas);
    const formulasWithHold = allFormulas.filter(
      (f) =>
        f.condition?.toUpperCase().includes('"HOLD"') ||
        f.condition?.toUpperCase().includes("'HOLD'") ||
        f.signal === "HOLD"
    );

    if (formulasWithHold.length > 0) {
      console.log(
        `\n⚠️  Found ${formulasWithHold.length} formulas that reference "HOLD":`
      );
      for (const formula of formulasWithHold) {
        console.log(`\n  Formula: ${formula.name} (ID: ${formula.id})`);
        console.log(`    Condition: ${formula.condition?.slice(0, 150)}...`);
        console.log(`    Signal field: ${formula.signal}`);
      }
    } else {
      console.log("✓ No formulas found with 'HOLD' in their conditions or signal field");
    }

    // 5. Ask user if they want to delete HOLD signals
    console.log("\n" + "=".repeat(80));
    console.log("RECOMMENDATION:");
    console.log("=".repeat(80));
    console.log();
    
    if (formulasWithHold.length > 0) {
      console.log("⚠️  Some formulas contain 'HOLD' in their conditions.");
      console.log("    Review these formulas and update them to return your desired signals.");
      console.log("    After updating formulas, recalculate signals for affected companies.");
    } else {
      console.log("✓ No formulas contain 'HOLD', so these signals may be from:");
      console.log("  1. Old formulas that have been deleted");
      console.log("  2. Legacy data that needs cleanup");
      console.log();
      console.log("💡 To remove all HOLD signals, run:");
      console.log('   DELETE FROM signals WHERE signal = "HOLD";');
      console.log();
      console.log("   Then recalculate signals for affected companies using:");
      console.log("   POST /api/signals/calculate");
    }

    console.log("\n" + "=".repeat(80));
  } catch (error) {
    console.error("❌ Error checking HOLD signals:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    throw error;
  }
}

checkAndCleanupHoldSignals().catch(console.error);
