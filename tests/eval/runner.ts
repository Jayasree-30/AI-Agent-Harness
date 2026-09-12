#!/usr/bin/env node
// Eval runner: drives the golden + injection + scope corpus through the
// orchestrator and reports a pass rate. Exit code 1 below threshold (80%).

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
	GeminiProvider,
	InMemoryRetrieval,
	seedKnowledgeBase,
} from "../../src/index.js";
import { FIXTURE_DOCUMENTS, DOMAIN_DESCRIPTION as DOMAIN } from "../../fixtures/index.js";
import { LLM_API_KEY_ENV, DEFAULT_BASE_URL } from "../../src/config/index.js";
import { GOLDEN_CASES, INJECTION_CASES, SCOPE_CASES, ALL_CASES, runEval, printReport } from "./corpus";

const TEST_DOCUMENTS = FIXTURE_DOCUMENTS;

async function main() {
	const filter = process.argv[2];
	let cases = ALL_CASES;
	if (filter === "golden") cases = GOLDEN_CASES;
	else if (filter === "injection") cases = INJECTION_CASES;
	else if (filter === "scope") cases = SCOPE_CASES;

	const apiKey = process.env[LLM_API_KEY_ENV];
	if (!apiKey) {
		console.error("ERROR: " + LLM_API_KEY_ENV + " is not set");
		console.error("Set " + LLM_API_KEY_ENV + "=AIza... before running npm run eval");
		process.exit(2);
	}

	const genAI = new GoogleGenerativeAI(apiKey);
	const llm = new GeminiProvider(genAI);
	const retrieval = new InMemoryRetrieval();
	await seedKnowledgeBase(retrieval, TEST_DOCUMENTS);

	console.log(`\nRunning eval: ${cases.length} cases (${filter ?? "all"})...\n`);
	const report = await runEval(llm, retrieval, TEST_DOCUMENTS, cases, DOMAIN);
	printReport(report);

	const threshold = 0.8;
	if (report.passRate < threshold) {
		console.error(
			`\nFAIL: Pass rate ${(report.passRate * 100).toFixed(1)}% < ${(threshold * 100).toFixed(0)}%`
		);
		process.exit(1);
	}

	console.log(
		`\nPASS: ${report.passed}/${report.total} (${(report.passRate * 100).toFixed(1)}%)`
	);
	process.exit(0);
}

main().catch((err) => {
	console.error("Eval runner crashed:", err);
	process.exit(1);
});
