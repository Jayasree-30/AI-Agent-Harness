# AI Agent Harness

A layered agent architecture for read-only, cited Q&A over a bounded knowledge base. Built with TypeScript, Zod, and Vitest. Deterministic pipeline, typed contracts, eval-driven.

## Features

- Answers questions using only documents you give it
- Cites which document chunk each fact comes from
- Refuses out-of-scope questions instead of guessing
- Blocks injection and jailbreak attempts
- Runs the same query against a test corpus to measure quality
- Mock providers for testing without an API key

## Setup

Requires Node.js 20+.

```bash
npm install
```

The test suite works without an API key. To use `AnthropicProvider` with a live LLM, set `ANTHROPIC_API_KEY` in your environment.

## Usage

```ts
import { createOrchestrator, seedKnowledgeBase, AnthropicProvider, InMemoryRetrieval } from "./src/index.js";

const llm = new AnthropicProvider(client);
const retrieval = new InMemoryRetrieval();
await seedKnowledgeBase(retrieval, yourDocuments);

const orchestrator = createOrchestrator(llm, retrieval, "your domain description");
const result = await orchestrator.run({ text: "How many vacation days?" });
```

## How to Test

Run all tests:

```bash
npm test
```

Run a single test file:

```bash
npx vitest run tests/unit/all.test.ts
```

Watch mode:

```bash
npx vitest
```

Type check:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Run the eval corpus against a real LLM:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run eval # all 21 cases
npm run eval -- --filter golden # 12 golden cases
npm run eval -- --filter injection # 5 injection cases
npm run eval -- --filter scope # 4 scope cases
```

Pass-rate threshold is 80%. Below that, exits non-zero for CI gating.

## Tech Stack

- TypeScript 5
- Zod (runtime type validation)
- Vitest (testing)
- Anthropic SDK (optional peer dependency for live LLM)
- npm (package manager)

## Project Layout

```
src/
├── index.ts # Public API
├── contracts/ # Zod schemas
├── orchestrator/ # Six-layer pipeline
├── providers/ # LLM and retrieval adapters
├── guardrails/ # Input, scope, output guards
├── prompts/ # Versioned prompt templates
├── tools/ # Tool interfaces
└── ui/ # Interactive CLI

tests/
├── unit/ # Component tests
├── contracts/ # Schema tests
└── eval/ # Golden Q&A + injection corpus + runner
```

## License

Apache-2.0
