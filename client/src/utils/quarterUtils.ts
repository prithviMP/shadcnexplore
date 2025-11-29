/**
 * Utility functions for quarter parsing, sorting, and formatting
 */

/**
 * Parse quarter string (e.g., "Mar 2024", "Jun 2023") to a sortable date
 */
export function parseQuarter(quarterStr: string | undefined | null): Date {
    // Handle null/undefined input
    if (!quarterStr || typeof quarterStr !== 'string') {
        return new Date(0);
    }

    const months: Record<string, number> = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    const parts = quarterStr.trim().toLowerCase().split(' ');
    if (parts.length !== 2) return new Date(0); // Invalid format

    const monthStr = parts[0].substring(0, 3);
    const year = parseInt(parts[1]);

    const month = months[monthStr];
    if (month === undefined || isNaN(year)) return new Date(0);

    return new Date(year, month, 1);
}

/**
 * Get quarter label (Q1, Q2, Q3, Q4) from month
 */
export function getQuarterLabel(quarterStr: string | undefined | null): string {
    // Handle null/undefined input
    if (!quarterStr || typeof quarterStr !== 'string') {
        return '';
    }

    const months: Record<string, string> = {
        'jan': 'Q4', 'feb': 'Q4', 'mar': 'Q4',  // Jan-Mar is Q4 of previous fiscal year
        'apr': 'Q1', 'may': 'Q1', 'jun': 'Q1',  // Apr-Jun is Q1
        'jul': 'Q2', 'aug': 'Q2', 'sep': 'Q2',  // Jul-Sep is Q2
        'oct': 'Q3', 'nov': 'Q3', 'dec': 'Q3'   // Oct-Dec is Q3
    };

    const monthStr = quarterStr.trim().toLowerCase().substring(0, 3);
    return months[monthStr] || '';
}

/**
 * Format quarter string with Q label (e.g., "Mar 2024" -> "Q4 Mar 2024")
 */
export function formatQuarterWithLabel(quarterStr: string | undefined | null): string {
    // Handle null/undefined input
    if (!quarterStr || typeof quarterStr !== 'string') {
        return '';
    }

    const label = getQuarterLabel(quarterStr);
    return label ? `${label} ${quarterStr}` : quarterStr;
}

/**
 * Sort quarters chronologically (oldest to newest)
 */
export function sortQuarters<T extends { quarter: string }>(quarters: T[]): T[] {
    if (!quarters || !Array.isArray(quarters)) return [];
    
    // Filter out items with invalid quarter values
    const validQuarters = quarters.filter(q => q && q.quarter && typeof q.quarter === 'string');
    
    return [...validQuarters].sort((a, b) => {
        const dateA = parseQuarter(a.quarter);
        const dateB = parseQuarter(b.quarter);
        return dateA.getTime() - dateB.getTime();
    });
}

/**
 * Sort quarter strings chronologically
 */
export function sortQuarterStrings(quarters: string[]): string[] {
    if (!quarters || !Array.isArray(quarters)) return [];
    
    // Filter out null/undefined/non-string values
    const validQuarters = quarters.filter(q => q && typeof q === 'string');
    
    return [...validQuarters].sort((a, b) => {
        const dateA = parseQuarter(a);
        const dateB = parseQuarter(b);
        return dateA.getTime() - dateB.getTime();
    });
}
