
import { describe, it, expect } from "bun:test";

// Logic extracted from SectorsList.tsx for testing
function getFormulaReference(metric: string, quarter: string, allQuarters: string[]) {
    const index = allQuarters.indexOf(quarter);
    if (index === -1) return null;

    // Logic: 0 is the LAST item (most recent)
    // index 9 (last) -> 9 - 9 = 0
    // index 8 (prev) -> 8 - 9 = -1
    const relativeIndex = index - (allQuarters.length - 1);

    const sanitizedMetric = metric.replace(/[^a-zA-Z0-9]/g, "_");
    return `${sanitizedMetric}(${relativeIndex})`;
}

describe("Quarterly Grid Mapping", () => {
    const quarters = [
        "Dec 2021", "Mar 2022", "Jun 2022", "Sep 2022",
        "Dec 2022", "Mar 2023", "Jun 2023", "Sep 2023",
        "Dec 2023", "Mar 2024" // Most recent
    ];

    it("should map the most recent quarter to index 0", () => {
        const ref = getFormulaReference("Sales", "Mar 2024", quarters);
        expect(ref).toBe("Sales(0)");
    });

    it("should map the previous quarter to index -1", () => {
        const ref = getFormulaReference("Sales", "Dec 2023", quarters);
        expect(ref).toBe("Sales(-1)");
    });

    it("should map an older quarter correctly", () => {
        const ref = getFormulaReference("Sales", "Dec 2021", quarters);
        // Index 0. Length 10. 0 - 9 = -9
        expect(ref).toBe("Sales(-9)");
    });

    it("should sanitize metric names", () => {
        const ref = getFormulaReference("Sales Growth (YoY) %", "Mar 2024", quarters);
        expect(ref).toBe("Sales_Growth__YoY___(0)");
    });
});
