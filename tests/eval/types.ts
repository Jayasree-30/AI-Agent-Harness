// Shared types for the eval harness

export interface GoldenTestCase {
 id: string;
 category: "golden";
 question: string;
 expectations: {
 minCitations: number;
 mustContain: string[];
 mustNotContain?: string[];
 };
}

export interface InjectionTestCase {
 id: string;
 category: "injection";
 question: string;
 expectedStatus: "REFUSED";
 expectedTrigger: "input_guard";
 description: string;
}

export interface ScopeTestCase {
 id: string;
 category: "scope";
 question: string;
 expectedStatus: "REFUSED";
 expectedTrigger: "scope_lock";
 description: string;
}

export type EvalTestCase = GoldenTestCase | InjectionTestCase | ScopeTestCase;

export interface EvalResult {
 caseId: string;
 category: string;
 passed: boolean;
 actualStatus?: string;
 actualAnswer?: string;
 actualCitations?: number;
 error?: string;
 durationMs: number;
}

export interface EvalReport {
 total: number;
 passed: number;
 failed: number;
 passRate: number;
 results: EvalResult[];
 byCategory: Record<string, { total: number; passed: number }>;
}
