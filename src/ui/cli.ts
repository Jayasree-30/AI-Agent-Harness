#!/usr/bin/env node
// Interactive CLI: typed questions, cited answers, terminal state visibility.
// Demo documents are inline; for production, replace with your own corpus.

import * as readline from "readline";
import { Anthropic } from "@anthropic-ai/sdk";
import {
	AnthropicProvider,
	InMemoryRetrieval,
	createOrchestrator,
	seedKnowledgeBase,
} from "../index.js";

const DOMAIN = "Company policies, employee handbook, and engineering guidelines";

const DOCUMENTS = [
	{
		id: "company-policies",
		title: "Company Policy Handbook",
		content:
			"Full-time employees accrue 20 vacation days per year. Up to 5 unused days carry over. Sick leave: 10 paid days per year. Paid parental leave: 12 weeks. Observed holidays: Christmas, Thanksgiving, New Year, Independence Day, Labor Day, Memorial Day. Holidays falling on weekends roll to nearest weekday. Remote work: 3 days per week. Meal reimbursement during travel: $75/day. Harassment reports go to hotline or conduct@company.com. Passwords: minimum 12 characters, rotate every 90 days. Performance reviews: semi-annually in June and December. Two-factor authentication is mandatory on all systems.",
	},
	{
		id: "engineering-guide",
		title: "Engineering Onboarding Guide",
		content:
			"Setup: clone repo, install deps, run tests. Code review: 2 approvals required. Deploy: CI/CD pipeline. Stack: TypeScript, Node.js. Branching: feature branches off main. PRs require passing CI.",
	},
];

function printUsage() {
	console.error("ERROR: ANTHROPIC_API_KEY environment variable is required");
	console.error("");
	console.error("Set it before running:");
	console.error(" Windows: set ANTHROPIC_API_KEY=sk-ant-...");
	console.error(" Unix: ANTHROPIC_API_KEY=sk-ant-... pnpm dev");
}

async function main() {
	console.log("\n AI Agent Harness - Read-Only Q&A Interface");
	console.log(" Type 'quit' or Ctrl+C to exit\n");

	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		printUsage();
		process.exit(1);
	}

	const baseURL = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
	const client = new Anthropic({ apiKey, baseURL });
	const llm = new AnthropicProvider(client);
	const retrieval = new InMemoryRetrieval();

	await seedKnowledgeBase(retrieval, DOCUMENTS);
	console.log(`Knowledge base loaded (${DOCUMENTS.length} documents). Ready.\n`);

	const orchestrator = createOrchestrator(llm, retrieval, DOMAIN, {
		maxIterations: 3,
		topK: 5,
	});

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "> ",
	});
	rl.prompt();

	rl.on("line", async (line) => {
		const trimmed = line.trim();
		if (!trimmed || trimmed === "quit" || trimmed === "exit" || trimmed === "q") {
			console.log("Goodbye.");
			rl.close();
			process.exit(0);
		}
		console.log("\nThinking...\n");
		const start = Date.now();
		try {
			const output = await orchestrator.run({ text: trimmed });
			if (output.status === "COMPLETED") {
				const ans = (output as { status: "COMPLETED"; answer: import("../contracts/schemas").Answer }).answer;
				console.log("-".repeat(60));
				console.log(ans.answer);
				console.log("-".repeat(60));
				console.log(`\nCitations (${ans.citations.length}):`);
				for (const c of ans.citations) {
					console.log(` [${c.chunkId}] "${c.excerpt.slice(0, 80)}..."`);
				}
				console.log(`\nConfidence: ${ans.confidence}`);
			} else {
				const reason = (output as { reason?: string }).reason ?? "";
				console.log(`[${output.status}] ${reason}`);
			}
			console.log(`\n${Date.now() - start}ms\n`);
		} catch (err) {
			console.error(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
		}
		rl.prompt();
	});

	rl.on("close", () => {
		console.log("\nGoodbye.");
		process.exit(0);
	});
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
