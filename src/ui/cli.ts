#!/usr/bin/env node
// Interactive CLI: typed questions, cited answers, terminal state visibility.
// Uses fixture documents from /fixtures for the demo. For production,
// replace with your own corpus.

import * as readline from "readline";
import { Anthropic } from "@anthropic-ai/sdk";
import {
	AnthropicProvider,
	InMemoryRetrieval,
	createOrchestrator,
	seedKnowledgeBase,
} from "../index.js";
import { FIXTURE_DOCUMENTS, DOMAIN_DESCRIPTION as DOMAIN } from "../../fixtures/index.js";
import { ANTHROPIC_API_KEY_ENV, ANTHROPIC_BASE_URL_ENV, DEFAULT_BASE_URL } from "../config/index.js";

const DOCUMENTS = FIXTURE_DOCUMENTS;

function printUsage() {
	console.error("ERROR: " + ANTHROPIC_API_KEY_ENV + " environment variable is required");
	console.error("");
	console.error("Set it before running:");
	console.error(" Windows: set " + ANTHROPIC_API_KEY_ENV + "=sk-ant-...");
	console.error(" Unix: " + ANTHROPIC_API_KEY_ENV + "=sk-ant-... npm run dev");
}

async function main() {
	console.log("\n AI Agent Harness - Read-Only Q&A Interface");
	console.log(" Type 'quit' or Ctrl+C to exit\n");

	const apiKey = process.env[ANTHROPIC_API_KEY_ENV];
	if (!apiKey) {
		printUsage();
		process.exit(1);
	}

	const baseURL = process.env[ANTHROPIC_BASE_URL_ENV] ?? DEFAULT_BASE_URL;
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
				const ans = output.answer;
				console.log("-".repeat(60));
				console.log(ans.answer);
				console.log("-".repeat(60));
				console.log(`\nCitations (${ans.citations.length}):`);
				for (const c of ans.citations) {
					console.log(` [${c.chunkId}] "${c.excerpt.slice(0, 80)}..."`);
				}
				console.log(`\nConfidence: ${ans.confidence}`);
			} else {
				const reason = output.reason ?? "";
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
