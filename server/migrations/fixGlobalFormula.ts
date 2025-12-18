/**
 * Fix Global Formula Assignment Script
 * 
 * This script finds the current global formula and assigns it to all companies
 * and sectors that don't have a formula assigned (or have a null formula).
 * 
 * Use case: When the global formula was accidentally deleted and recreated,
 * this script ensures all entities use the new global formula.
 * 
 * Run with: npx tsx server/migrations/fixGlobalFormula.ts
 * 
 * This script is safe to run multiple times.
 */

import "dotenv/config";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

async function fixGlobalFormula() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log("🔧 Fixing global formula assignments...\n");

    // Step 1: Find the global formula
    const globalFormulaResult = await pool.query(`
      SELECT id, name, condition, scope 
      FROM formulas 
      WHERE scope = 'global' 
      ORDER BY created_at DESC 
      LIMIT 1;
    `);

    if (globalFormulaResult.rows.length === 0) {
      console.error("❌ Error: No global formula found in the database.");
      console.log("   Please create a global formula first, then run this script again.");
      process.exit(1);
    }

    const globalFormula = globalFormulaResult.rows[0];
    console.log(`✓ Found global formula: "${globalFormula.name}" (ID: ${globalFormula.id})`);
    console.log(`  Condition: ${globalFormula.condition.substring(0, 100)}${globalFormula.condition.length > 100 ? '...' : ''}\n`);

    // Step 2: Count companies without formula assignment
    const companiesWithoutFormula = await pool.query(`
      SELECT COUNT(*) as count 
      FROM companies 
      WHERE assigned_formula_id IS NULL;
    `);
    const companiesCount = parseInt(companiesWithoutFormula.rows[0].count || "0", 10);

    // Step 3: Count sectors without formula assignment
    const sectorsWithoutFormula = await pool.query(`
      SELECT COUNT(*) as count 
      FROM sectors 
      WHERE assigned_formula_id IS NULL;
    `);
    const sectorsCount = parseInt(sectorsWithoutFormula.rows[0].count || "0", 10);

    console.log(`📊 Current state:`);
    console.log(`   - Companies without formula: ${companiesCount}`);
    console.log(`   - Sectors without formula: ${sectorsCount}\n`);

    if (companiesCount === 0 && sectorsCount === 0) {
      console.log("✅ All companies and sectors already have formulas assigned.");
      console.log("   If you still need to update them, check if they have invalid formula IDs.");
      
      // Check for invalid formula IDs
      const invalidCompanyFormulas = await pool.query(`
        SELECT COUNT(*) as count 
        FROM companies c
        LEFT JOIN formulas f ON c.assigned_formula_id = f.id
        WHERE c.assigned_formula_id IS NOT NULL AND f.id IS NULL;
      `);
      const invalidCompanyCount = parseInt(invalidCompanyFormulas.rows[0].count || "0", 10);

      const invalidSectorFormulas = await pool.query(`
        SELECT COUNT(*) as count 
        FROM sectors s
        LEFT JOIN formulas f ON s.assigned_formula_id = f.id
        WHERE s.assigned_formula_id IS NOT NULL AND f.id IS NULL;
      `);
      const invalidSectorCount = parseInt(invalidSectorFormulas.rows[0].count || "0", 10);

      if (invalidCompanyCount > 0 || invalidSectorCount > 0) {
        console.log(`\n⚠️  Found invalid formula references:`);
        console.log(`   - Companies with invalid formula IDs: ${invalidCompanyCount}`);
        console.log(`   - Sectors with invalid formula IDs: ${invalidSectorCount}`);
        console.log(`\n   Fixing invalid references...\n`);

        // Fix invalid company formulas
        if (invalidCompanyCount > 0) {
          const updateCompanies = await pool.query(`
            UPDATE companies 
            SET assigned_formula_id = $1, updated_at = NOW()
            WHERE assigned_formula_id IS NOT NULL 
            AND assigned_formula_id NOT IN (SELECT id FROM formulas);
          `, [globalFormula.id]);
          console.log(`✓ Updated ${updateCompanies.rowCount} companies with invalid formula IDs`);
        }

        // Fix invalid sector formulas
        if (invalidSectorCount > 0) {
          const updateSectors = await pool.query(`
            UPDATE sectors 
            SET assigned_formula_id = $1
            WHERE assigned_formula_id IS NOT NULL 
            AND assigned_formula_id NOT IN (SELECT id FROM formulas);
          `, [globalFormula.id]);
          console.log(`✓ Updated ${updateSectors.rowCount} sectors with invalid formula IDs`);
        }
      }

      process.exit(0);
    }

    // Step 4: Update companies without formula
    if (companiesCount > 0) {
      console.log(`📝 Updating ${companiesCount} companies...`);
      const updateCompanies = await pool.query(`
        UPDATE companies 
        SET assigned_formula_id = $1, updated_at = NOW()
        WHERE assigned_formula_id IS NULL;
      `, [globalFormula.id]);
      console.log(`✓ Updated ${updateCompanies.rowCount} companies\n`);
    }

    // Step 5: Update sectors without formula
    if (sectorsCount > 0) {
      console.log(`📝 Updating ${sectorsCount} sectors...`);
      const updateSectors = await pool.query(`
        UPDATE sectors 
        SET assigned_formula_id = $1
        WHERE assigned_formula_id IS NULL;
      `, [globalFormula.id]);
      console.log(`✓ Updated ${updateSectors.rowCount} sectors\n`);
    }

    // Step 6: Verify the fix
    const verifyCompanies = await pool.query(`
      SELECT COUNT(*) as count 
      FROM companies 
      WHERE assigned_formula_id IS NULL;
    `);
    const remainingCompanies = parseInt(verifyCompanies.rows[0].count || "0", 10);

    const verifySectors = await pool.query(`
      SELECT COUNT(*) as count 
      FROM sectors 
      WHERE assigned_formula_id IS NULL;
    `);
    const remainingSectors = parseInt(verifySectors.rows[0].count || "0", 10);

    console.log("✅ Global formula assignment fix completed!\n");
    console.log("📊 Final state:");
    console.log(`   - Companies without formula: ${remainingCompanies}`);
    console.log(`   - Sectors without formula: ${remainingSectors}`);

    if (remainingCompanies === 0 && remainingSectors === 0) {
      console.log("\n🎉 Success! All companies and sectors now have the global formula assigned.");
    } else {
      console.log(`\n⚠️  Warning: ${remainingCompanies + remainingSectors} entities still don't have formulas assigned.`);
    }

  } catch (error: any) {
    console.error("\n❌ Error fixing global formula:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixGlobalFormula()
  .then(() => {
    console.log("\n✨ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });
