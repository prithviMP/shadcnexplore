/**
 * Script to check all formulas for "HOLD" references
 */

import "dotenv/config";
import { db } from "./db";
import { formulas } from "@shared/schema";

async function checkFormulasForHold() {
  console.log("=".repeat(80));
  console.log("CHECKING ALL FORMULAS FOR 'HOLD' REFERENCES");
  console.log("=".repeat(80));
  console.log();

  try {
    const allFormulas = await db.select().from(formulas);
    
    console.log(`Total formulas in database: ${allFormulas.length}\n`);

    const formulasWithHold = allFormulas.filter(
      (f) =>
        f.condition?.toUpperCase().includes('"HOLD"') ||
        f.condition?.toUpperCase().includes("'HOLD'") ||
        f.signal === "HOLD"
    );

    if (formulasWithHold.length > 0) {
      console.log(`⚠️  Found ${formulasWithHold.length} formula(s) that reference "HOLD":\n`);
      for (const formula of formulasWithHold) {
        console.log(`Formula: ${formula.name} (ID: ${formula.id})`);
        console.log(`  Scope: ${formula.scope}${formula.scopeValue ? ` (${formula.scopeValue})` : ''}`);
        console.log(`  Enabled: ${formula.enabled}`);
        console.log(`  Signal field: "${formula.signal}"`);
        console.log(`  Formula Type: ${formula.formulaType || 'simple'}`);
        
        // Check if condition contains HOLD
        const conditionUpper = formula.condition?.toUpperCase() || '';
        const hasHoldInCondition = conditionUpper.includes('"HOLD"') || conditionUpper.includes("'HOLD'");
        console.log(`  Has "HOLD" in condition: ${hasHoldInCondition ? "YES ⚠️" : "NO"}`);
        
        if (formula.condition) {
          // Show first 200 chars of condition
          const preview = formula.condition.slice(0, 200);
          console.log(`  Condition preview: ${preview}${formula.condition.length > 200 ? "..." : ""}`);
          
          // Count occurrences of HOLD
          const holdMatches = (formula.condition.match(/["']HOLD["']/gi) || []).length;
          if (holdMatches > 0) {
            console.log(`  ⚠️  Found ${holdMatches} occurrence(s) of "HOLD" in condition`);
          }
        }
        console.log();
      }
    } else {
      console.log("✓ No formulas found with 'HOLD' in their conditions or signal field");
      console.log("\nThis means HOLD signals might be coming from:");
      console.log("  1. Old formulas that were deleted but signals remain");
      console.log("  2. Formulas evaluated in the past that are now cached");
      console.log("  3. Need to recalculate signals with current formulas");
    }

    // Show all enabled formulas for reference
    const enabledFormulas = allFormulas.filter(f => f.enabled);
    console.log(`\n📋 Enabled Formulas (${enabledFormulas.length}):`);
    enabledFormulas.forEach(f => {
      console.log(`  - ${f.name} (${f.scope}${f.scopeValue ? `:${f.scopeValue}` : ''}, priority: ${f.priority})`);
    });

    console.log("\n" + "=".repeat(80));
  } catch (error) {
    console.error("❌ Error checking formulas:", error);
    throw error;
  }
}

checkFormulasForHold().catch(console.error);
