/**
 * Script to calculate signals for all companies using the latest enabled global formula
 */

import "dotenv/config";
import { FormulaEvaluator } from "./formulaEvaluator";

async function calculateAllSignals() {
  console.log("=".repeat(80));
  console.log("CALCULATING SIGNALS FOR ALL COMPANIES");
  console.log("=".repeat(80));
  console.log();

  try {
    const signalsGenerated = await FormulaEvaluator.calculateAndStoreSignals();
    
    console.log();
    console.log("=".repeat(80));
    console.log(`✓ SIGNAL CALCULATION COMPLETE`);
    console.log(`  Total signals generated: ${signalsGenerated}`);
    console.log("=".repeat(80));
    
  } catch (error) {
    console.error("❌ Error during signal calculation:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the calculation
calculateAllSignals();
