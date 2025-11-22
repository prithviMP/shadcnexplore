
import { evaluateExcelFormulaForCompany } from "./server/excelFormulaEvaluator";
import { storage } from "./server/storage";

// Mock storage.getQuarterlyDataByTicker
storage.getQuarterlyDataByTicker = async (ticker: string) => {
    return [
        {
            quarter: "Sep 2024",
            metricName: "Sales Growth(YoY) %",
            metricValue: "20"
        },
        {
            quarter: "Jun 2024",
            metricName: "Sales Growth(YoY) %",
            metricValue: "15"
        },
        {
            quarter: "Mar 2024",
            metricName: "Sales Growth(YoY) %",
            metricValue: "10"
        },
        {
            quarter: "Dec 2023",
            metricName: "Sales Growth(YoY) %",
            metricValue: "5"
        }
    ] as any;
};

async function runTest() {
    console.log("Testing Excel Formula with Selected Quarters...");

    // Test 1: No selection (Default behavior)
    // Q12 should be Sep 2024 (20%)
    const result1 = await evaluateExcelFormulaForCompany("TEST", "Q12");
    console.log(`Test 1 (No selection, expect 0.2): ${result1}`);

    // Test 2: Select "Jun 2024" and "Mar 2024"
    // Q12 should now be Jun 2024 (15%) because it's the most recent *selected* quarter
    const result2 = await evaluateExcelFormulaForCompany("TEST", "Q12", ["Jun 2024", "Mar 2024"]);
    console.log(`Test 2 (Select Jun/Mar, expect 0.15): ${result2}`);

    // Test 3: Select only "Dec 2023"
    // Q12 should be Dec 2023 (5%)
    const result3 = await evaluateExcelFormulaForCompany("TEST", "Q12", ["Dec 2023"]);
    console.log(`Test 3 (Select Dec, expect 0.05): ${result3}`);

    // Test 4: Complex Formula with selection
    // IF(Q12 > 10%, "High", "Low")
    // With Jun 2024 (15%), should be "High"
    const result4 = await evaluateExcelFormulaForCompany("TEST", 'IF(Q12 > 10%, "High", "Low")', ["Jun 2024"]);
    console.log(`Test 4 (Complex with selection, expect High): ${result4}`);

    // Test 5: Complex Formula with selection (Low case)
    // IF(Q12 > 10%, "High", "Low")
    // With Dec 2023 (5%), should be "Low"
    const result5 = await evaluateExcelFormulaForCompany("TEST", 'IF(Q12 > 10%, "High", "Low")', ["Dec 2023"]);
    console.log(`Test 5 (Complex with selection, expect Low): ${result5}`);
}

runTest().catch(console.error);
