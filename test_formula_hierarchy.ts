
import { FormulaEvaluator } from "./server/formulaEvaluator";
import { Formula } from "@shared/schema";

// Mock data
const mockCompany = {
    id: "company1",
    ticker: "TEST",
    sectorId: "sector1",
    financialData: { roe: 25 }
} as any;

const mockFormulas: Formula[] = [
    {
        id: "global1",
        name: "Global Rule",
        scope: "global",
        scopeValue: null,
        condition: "roe > 10",
        signal: "BUY",
        priority: 10,
        enabled: true,
        formulaType: "simple"
    } as any,
    {
        id: "sector1",
        name: "Sector Rule",
        scope: "sector",
        scopeValue: "sector1",
        condition: "roe > 20",
        signal: "HOLD",
        priority: 5,
        enabled: true,
        formulaType: "simple"
    } as any,
    {
        id: "company1",
        name: "Company Rule",
        scope: "company",
        scopeValue: "company1",
        condition: "roe > 30", // Should fail for roe=25
        signal: "SELL",
        priority: 1,
        enabled: true,
        formulaType: "simple"
    } as any
];

async function runTest() {
    console.log("Testing Formula Hierarchy...");

    // Test 1: All formulas present
    // Company rule (roe > 30) should run first. Since roe=25, it returns false.
    // Wait, the logic in generateSignalForCompany iterates through sorted formulas and returns the FIRST match.
    // So if Company rule fails, it should fall back to Sector, then Global?
    // The user requirement was "decide what to do... rest will use default".
    // Usually this means specific rules *override* general ones.
    // If a specific rule exists but returns false, does that mean "No Signal" or "Fall through"?
    // The implementation sorts by specificity. So it tries Company first.
    // If Company formula evaluates to TRUE, it returns that signal.
    // If Company formula evaluates to FALSE, it continues to the next one (Sector).

    // Let's adjust the test case to verify PRIORITY.
    // We want to see which signal is returned when MULTIPLE formulas *could* match.

    // Scenario A: Company rule matches.
    const formulasA = mockFormulas.map(f => ({ ...f }));
    formulasA[2].condition = "roe > 20"; // Company rule now matches (25 > 20)
    // Expected: Company signal (SELL)

    const resultA = await FormulaEvaluator.generateSignalForCompany(mockCompany, formulasA);
    console.log(`Test A (Company match): Expected SELL, Got ${resultA?.signal}`);

    // Scenario B: Company rule doesn't match, Sector rule matches.
    const formulasB = mockFormulas.map(f => ({ ...f }));
    // Company rule (roe > 30) fails.
    // Sector rule (roe > 20) matches.
    // Expected: Sector signal (HOLD)
    const resultB = await FormulaEvaluator.generateSignalForCompany(mockCompany, formulasB);
    console.log(`Test B (Sector match): Expected HOLD, Got ${resultB?.signal}`);

    // Scenario C: Company/Sector fail, Global matches.
    const formulasC = mockFormulas.map(f => ({ ...f }));
    formulasC[2].condition = "roe > 30"; // Company fails
    formulasC[1].condition = "roe > 30"; // Sector fails
    // Global (roe > 10) matches.
    // Expected: Global signal (BUY)
    const resultC = await FormulaEvaluator.generateSignalForCompany(mockCompany, formulasC);
    console.log(`Test C (Global match): Expected BUY, Got ${resultC?.signal}`);

    // Scenario D: Priority Check within same scope
    // Two global formulas. Higher priority (lower number) should win.
    const formulasD = [
        { ...mockFormulas[0], id: "g1", priority: 10, signal: "LOW_PRIO" },
        { ...mockFormulas[0], id: "g2", priority: 1, signal: "HIGH_PRIO" }
    ];
    const resultD = await FormulaEvaluator.generateSignalForCompany(mockCompany, formulasD);
    console.log(`Test D (Priority): Expected HIGH_PRIO, Got ${resultD?.signal}`);

}

runTest().catch(console.error);
