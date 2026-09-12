#!/usr/bin/env node
// Demo script — fully offline, no API key needed.
// Uses MockRetrieval + MockLlmProvider for 100% reliable demo output.

import {
	MockLlmProvider,
	MockRetrieval,
	createOrchestrator,
	seedKnowledgeBase,
} from "./src/index.js";
import { DOMAIN_DESCRIPTION } from "./fixtures/index.js";

// Mock LLM responses in EXACT order the orchestrator calls them:
// 1. InputGuard safety check
// 2. ScopeLock domain check
// 3. Grounding check (iteration 1)
// 4. Answer generation (iteration 1)
// 5. OutputGuard citation check
const mockResponses = [
	'{"is_suspicious": false}',
	'{"in_scope": true}',
	'{"relevant": true, "reasoning": "Chunks contain vacation policy"}',
	"Full-time employees accrue **20 vacation days per year**, pro-rated based on start date. Unused days roll over up to 5 days. [source:company-policies-chunk-0]",
	'{"has_citations": true}',
];

// Mock retrieval with a single relevant chunk
const retrieval = new MockRetrieval([
	{
		id: "company-policies-chunk-0",
		documentId: "company-policies",
		content: "Full-time employees accrue 20 vacation days per year, pro-rated based on start date. Unused days roll over up to 5 days.",
		score: 0.95,
	},
]);

const llm = new MockLlmProvider(mockResponses);
const orch = createOrchestrator(llm, retrieval, DOMAIN_DESCRIPTION, {
	maxIterations: 3,
	topK: 5,
});

console.log("\n=== DEMO 1: Golden Path ===\n");
const r1 = await orch.run({ text: "How many vacation days do employees get?" });
console.log(`Status: ${r1.status}`);
if (r1.status === "COMPLETED") {
	console.log(`Answer: ${r1.answer.answer}`);
	console.log(`\nCitations (${r1.answer.citations.length}):`);
	for (const c of r1.answer.citations) {
		console.log(` [${c.chunkId}] "${c.excerpt}"`);
	}
	console.log(`\nConfidence: ${r1.answer.confidence}`);
} else {
	console.log(`Reason: ${r1.reason}`);
	console.log(`Trigger: ${r1.trigger}`);
}
console.log(`\nTrace: ${orch.getTrace().map((s) => s.label).join(" → ")}`);
console.log(`Iteration: ${r1.iteration}`);

// --- DEMO 2: Out-of-scope refusal ---
const mockResponses2 = [
	'{"is_suspicious": false}',
	'{"in_scope": false, "reason": "Weather is not in the knowledge domain"}',
];
const llm2 = new MockLlmProvider(mockResponses2);
const orch2 = createOrchestrator(llm2, retrieval, DOMAIN_DESCRIPTION, {
	maxIterations: 3,
	topK: 5,
});

console.log("\n=== DEMO 2: Out-of-Scope Refusal ===\n");
const r2 = await orch2.run({ text: "What's the weather in Tokyo?" });
console.log(`Status: ${r2.status}`);
if (r2.status === "COMPLETED") {
	console.log(`Answer: ${r2.answer.answer}`);
} else {
	console.log(`Reason: ${r2.reason}`);
	console.log(`Trigger: ${r2.trigger}`);
}
console.log(`\nTrace: ${orch2.getTrace().map((s) => s.label).join(" → ")}`);
