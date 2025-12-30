import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

const AUTH_TOKEN_KEY = "auth_token";

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let url = queryKey[0] as string;
    const allParams = new URLSearchParams();
    
    for (let i = 1; i < queryKey.length; i++) {
      const part = queryKey[i];
      if (typeof part === 'string' || typeof part === 'number' || typeof part === 'boolean') {
        url += `/${String(part)}`;
      } else if (typeof part === 'object' && part !== null) {
        for (const [key, value] of Object.entries(part)) {
          if (value !== undefined && value !== null) {
            allParams.append(key, String(value));
          }
        }
      }
    }

    const queryString = allParams.toString();
    if (queryString) {
      const separator = url.includes('?') ? '&' : '?';
      url += separator + queryString;
    }

    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Get formula evaluation trace
 */
export async function getFormulaEvaluationTrace(
  ticker: string,
  formula: string,
  selectedQuarters?: string[]
): Promise<{
  trace: {
    originalFormula: string;
    formulaWithSubstitutions: string;
    substitutions: Array<{
      original: string;
      metricName: string;
      quarter: string;
      quarterIndex: number;
      value: number | null;
      normalized: boolean;
    }>;
    steps: Array<{
      type: string;
      description: string;
      input?: any;
      output?: any;
      metadata?: Record<string, any>;
      timestamp: number;
    }>;
    result: string | number | boolean | null;
    usedQuarters: string[];
    evaluationTime: number;
  };
  result: string | number | boolean | null;
  resultType: string;
  usedQuarters: string[];
}> {
  const res = await apiRequest("POST", "/api/v1/formulas/evaluate-trace", {
    ticker,
    formula,
    selectedQuarters,
  });
  return res.json();
}
