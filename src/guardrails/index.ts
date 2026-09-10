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
			/ignore\s+all/i,
			/you\s+are\s+(now|a)\s+/i,
			/disregard/i,
			/override/i,
			/reveal\s+(your|the)\s+(system|prompt|instructions|rules|configuration)/i,
			/pretend\s+(you\s+are|to\s+be)/i,
			/DAN\s*mode/i,
			/developer\s+mode/i,
			/jailbreak/i,
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
			const response = await this.llm.generate([
				{ role: "system", content: getPrompt("guard.input").template },
				{ role: "user", content: message },
			]);
			const cleaned = response.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
			const result = JSON.parse(cleaned);
			if (result.is_suspicious) return { blocked: true, reason: result.reason ?? "LLM flagged" };
		} catch {
			return { blocked: true, reason: "Could not verify safety" };
		}
		return { blocked: false };
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
			const response = await this.llm.generate([{ role: "user", content: rendered }]);
			const cleaned = response.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
			const result = JSON.parse(cleaned);
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
			const response = await this.llm.generate([{ role: "user", content: rendered }]);
			const cleaned = response.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
			const result = JSON.parse(cleaned);
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
