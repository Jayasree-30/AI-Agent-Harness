import type { LlmProvider } from "../providers/llm/index.js";
import { getPrompt } from "../prompts/registry.js";

export interface InputGuardResult { blocked: boolean; reason?: string; }
export interface OutputGuardResult { blocked: boolean; reason?: string; }
export interface ScopeLockResult { allowed: boolean; reason?: string; }

export class InputGuard {
	constructor(private readonly llm: LlmProvider) {}

	async check(message: string): Promise<InputGuardResult> {
		const patterns = [
			/ignore\s+(all\s+)?(previous|above|earlier|your)\s+(instructions|prompts|rules|guidelines)/i,
			/disregard\s+(all\s+)?(previous|above|earlier|your)\s+(instructions|prompts|rules|guidelines)/i,
			/ignore\s+all\s+instructions/i,
			/you\s+are\s+(now|a)\s+/i,
			/override\s+(your|the)\s+(instructions|rules|guidelines|constraints)/i,
			/reveal\s+(your|the)\s+(system|prompt|instructions|rules|configuration)/i,
			/pretend\s+(you\s+are|to\s+be)/i,
			/\bDAN\s*mode\b/i,
			/\bdeveloper\s*mode\b/i,
			/\bjailbreak\b/i,
			/\[INST\]/i,
			/<\|im_start\|>/i,
			/system\s*prompt/i,
			/hidden\s*(rules|instructions)/i,
			/drop\s+your\s+(constraints|guardrails|rules)/i,
		];
		for (const p of patterns) {
			if (p.test(message)) return { blocked: true, reason: `Heuristic: ${p.source}` };
		}

		try {
			const prompt = getPrompt("guard.input");
			const rendered = renderPrompt(prompt.template, { message });
			const { data: result } = await this.llm.generateWithJson<{ is_suspicious?: boolean; reason?: string }>(
				[
					{ role: "system", content: "You are a safety classifier. Always respond with valid JSON only." },
					{ role: "user", content: rendered },
				],
				"object with is_suspicious boolean"
			);
			if (result.is_suspicious === true) return { blocked: true, reason: result.reason ?? "LLM flagged" };
			if (result.is_suspicious === false) return { blocked: false };
			// is_suspicious is undefined — couldn't determine, fail closed
			return { blocked: true, reason: "Could not verify safety (ambiguous LLM response)" };
		} catch {
			return { blocked: true, reason: "Could not verify safety (LLM check failed)" };
		}
	}
}

export class OutputGuard {
	constructor(private readonly llm: LlmProvider) {}

	async check(answer: string): Promise<OutputGuardResult> {
		// First check: heuristic citation presence
		const citationPattern = /\[source:[^\]]+\]/i;
		const citations = (answer.match(citationPattern) ?? []);
		if (citations.length === 0) {
			return { blocked: true, reason: "No citations found in answer" };
		}

		// Second check: LLM verification that citations are meaningful
		try {
			const prompt = getPrompt("answer.output_guard");
			const rendered = renderPrompt(prompt.template, { answer });
			const { data: result } = await this.llm.generateWithJson<{ has_citations?: boolean }>(
				[{ role: "user", content: rendered }],
				"object with has_citations boolean"
			);
			if (!result.has_citations) return { blocked: true, reason: "LLM verified: no valid citations" };
			return { blocked: false };
		} catch {
			return { blocked: true, reason: "Could not verify citations" };
		}
	}
}

export class ScopeLock {
	constructor(private readonly llm: LlmProvider, private readonly domainDescription: string) {}

	async check(question: string): Promise<ScopeLockResult> {
		const prompt = getPrompt("guard.scope");
		const rendered = renderPrompt(prompt.template, {
			domain_description: this.domainDescription,
			question,
		});
		try {
			const { data: result } = await this.llm.generateWithJson<{ in_scope?: boolean; reason?: string }>(
				[{ role: "user", content: rendered }],
				"object with in_scope boolean"
			);
			if (result.in_scope) return { allowed: true };
			if (!result.in_scope) return { allowed: false, reason: result.reason ?? "Out of scope" };
		} catch {
			/* fail-closed */
		}
		return { allowed: false, reason: "Could not determine scope" };
	}
}

function renderPrompt(template: string, vars: Record<string, string>): string {
	let r = template;
	for (const [k, v] of Object.entries(vars)) r = r.replaceAll(`{{${k}}}`, v);
	return r;
}
