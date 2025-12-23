/**
 * Debug script to trace formula evaluation for INFY (Infosys)
 * Shows: data from DB, how it's inserted into formula, and step-by-step evaluation
 */

import "dotenv/config";
import { storage } from "./storage";
import { evaluateExcelFormulaForCompany } from "./excelFormulaEvaluator";
import { db } from "./db";
import { formulas } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

async function debugInfyFormula() {
  const ticker = "INFY";
  
  console.log("=".repeat(80));
  console.log(`DEBUGGING FORMULA EVALUATION FOR ${ticker}`);
  console.log("=".repeat(80));
  
  try {
    // 1. Fetch all quarterly data from DB
    console.log("\n1. FETCHING QUARTERLY DATA FROM DATABASE...");
    console.log("-".repeat(80));
    const quarterlyData = await storage.getQuarterlyDataByTicker(ticker);
    
    if (!quarterlyData || quarterlyData.length === 0) {
      console.log(`❌ No quarterly data found for ${ticker}`);
      return;
    }
    
    console.log(`✓ Found ${quarterlyData.length} quarterly data records`);
    
    // Group by quarter to see structure
    const quartersMap = new Map<string, Map<string, any>>();
    quarterlyData.forEach(item => {
      if (!quartersMap.has(item.quarter)) {
        quartersMap.set(item.quarter, new Map());
      }
      quartersMap.get(item.quarter)!.set(item.metricName, item.metricValue);
    });
    
    const uniqueQuarters = Array.from(quartersMap.keys());
    const sortedQuarters = uniqueQuarters.sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
        return dateB.getTime() - dateA.getTime(); // Descending (newest first)
      }
      return b.localeCompare(a);
    });
    
    console.log(`\n  Total unique quarters: ${uniqueQuarters.length}`);
    console.log(`  Quarters (newest first): ${sortedQuarters.join(', ')}`);
    
    // Show last 12 quarters (or all if less than 12)
    const quartersToUse = sortedQuarters.length > 12 
      ? sortedQuarters.slice(0, 12)
      : sortedQuarters;
    
    console.log(`\n  Quarters to use for formula (last 12 or all): ${quartersToUse.length}`);
    console.log(`  ${quartersToUse.join(', ')}`);
    
    // Show metrics for each quarter (top 10 metrics)
    console.log("\n  Sample data structure (showing first 3 quarters with key metrics):");
    const keyMetrics = ['Sales', 'Sales Growth(YoY) %', 'Sales Growth(QoQ) %', 'OPM %', 'EPS in Rs', 'EPS Growth(YoY) %', 'EPS Growth(QoQ) %'];
    for (let i = 0; i < Math.min(3, quartersToUse.length); i++) {
      const quarter = quartersToUse[i];
      const metrics = quartersMap.get(quarter)!;
      console.log(`\n    Q${quartersToUse.length - i} (${quarter}):`);
      keyMetrics.forEach(metric => {
        const value = metrics.get(metric);
        if (value !== undefined) {
          console.log(`      ${metric}: ${value}`);
        }
      });
    }
    
    // 2. Get active global formula
    console.log("\n\n2. FETCHING ACTIVE FORMULA...");
    console.log("-".repeat(80));
    
    const allFormulas = await db
      .select()
      .from(formulas)
      .where(eq(formulas.enabled, true))
      .orderBy(formulas.priority, desc(formulas.createdAt));
    
    // Find global formula (highest priority = lowest priority number)
    const globalFormulas = allFormulas
      .filter(f => f.scope === 'global')
      .sort((a, b) => a.priority - b.priority);
    
    if (globalFormulas.length === 0) {
      console.log("❌ No enabled global formulas found");
      return;
    }
    
    // Show all global formulas
    console.log(`\n  All enabled global formulas (sorted by priority, lower = higher priority):`);
    globalFormulas.forEach((f, idx) => {
      console.log(`    ${idx + 1}. "${f.name}" (ID: ${f.id}) - Priority: ${f.priority}${idx === 0 ? ' [SELECTED]' : ''}`);
    });
    
    const activeFormula = globalFormulas[0];
    console.log(`✓ Found active formula: "${activeFormula.name}" (ID: ${activeFormula.id})`);
    console.log(`  Type: ${activeFormula.formulaType}`);
    console.log(`  Priority: ${activeFormula.priority}`);
    console.log(`  Signal: ${activeFormula.signal}`);
    console.log(`\n  Formula condition (FULL):`);
    console.log(activeFormula.condition);
    
    // 3. Show how Q12, Q11, etc. map to quarters
    console.log("\n\n3. QUARTER MAPPING (Q12 = newest, Q1 = oldest of selected quarters)...");
    console.log("-".repeat(80));
    console.log(`  Using ${quartersToUse.length} quarters (sorted newest first):`);
    for (let i = 0; i < quartersToUse.length; i++) {
      const quarterIndex = quartersToUse.length - i; // Q12, Q11, Q10, ..., Q1
      const quarter = quartersToUse[i];
      console.log(`    Q${quarterIndex} -> ${quarter} (array index ${i})`);
    }
    
    // 4. Show specific metric values for Q12, Q11, etc. that the formula might use
    console.log("\n\n4. KEY METRIC VALUES FOR FORMULA (showing Q12-Q1)...");
    console.log("-".repeat(80));
    
    const formulaUsesQ = activeFormula.condition.match(/[QP](\d+)/g);
    if (formulaUsesQ) {
      const qNumbers = Array.from(new Set(formulaUsesQ.map(m => parseInt(m.replace(/[QP]/, ''), 10))));
      const maxQ = Math.max(...qNumbers);
      
      console.log(`  Formula uses quarters up to Q${maxQ}`);
      
      // Show key metrics for quarters the formula uses
      const metricsToShow = ['Sales', 'Sales Growth(YoY) %', 'Sales Growth(QoQ) %', 'OPM %', 'EPS in Rs', 'EPS Growth(YoY) %', 'EPS Growth(QoQ) %'];
      
      for (const qNum of qNumbers.slice().sort((a, b) => b - a)) { // Show highest Q first
        if (qNum > quartersToUse.length) {
          console.log(`\n    Q${qNum}: ⚠️  NOT AVAILABLE (only have ${quartersToUse.length} quarters)`);
          continue;
        }
        
        const arrayIndex = quartersToUse.length - qNum; // Q12 -> index 0, Q1 -> index length-1
        const quarter = quartersToUse[arrayIndex];
        const metrics = quartersMap.get(quarter)!;
        
        console.log(`\n    Q${qNum} (${quarter}, array index ${arrayIndex}):`);
        metricsToShow.forEach(metric => {
          const value = metrics.get(metric);
          if (value !== undefined && value !== null) {
            console.log(`      ${metric}: ${value}`);
          }
        });
      }
    }
    
    // 5. Evaluate the formula
    console.log("\n\n5. EVALUATING FORMULA...");
    console.log("-".repeat(80));
    
    // Use the same logic as formulaEvaluator: last 12 quarters
    const evalResult = await evaluateExcelFormulaForCompany(ticker, activeFormula.condition, quartersToUse);
    
    console.log(`\n  Result: ${JSON.stringify(evalResult.result)}`);
    console.log(`  Result Type: ${evalResult.resultType}`);
    console.log(`  Used Quarters: ${evalResult.usedQuarters.join(', ')}`);
    
    // 6. Show detailed evaluation trace
    console.log("\n\n6. FORMULA EVALUATION SUMMARY...");
    console.log("-".repeat(80));
    if (evalResult.result === "No Signal" || evalResult.result === null) {
      console.log("  ⚠️  RESULT: No Signal");
      console.log("\n  Possible reasons:");
      console.log("    - Formula condition evaluated to false");
      console.log("    - Missing data for required quarters (Q12, Q11, etc.)");
      console.log("    - ISNUMBER checks failing (null/undefined values)");
      console.log("    - Formula logic not meeting any condition branch");
    } else {
      console.log(`  ✓ RESULT: ${evalResult.result}`);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("DEBUG COMPLETE");
    console.log("=".repeat(80));
    
  } catch (error) {
    console.error("❌ Error during debugging:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
  } finally {
    process.exit(0);
  }
}

// Run the debug script
debugInfyFormula();
