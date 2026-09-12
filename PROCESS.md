# Process Document

This document captures the assumptions, scoping, design decisions, and trade-offs behind this take-home implementation. It complements the README by explaining the *why* behind the architecture rather than the *what*.

## Assumptions

The brief was clear about the read-only, cited Q&A core but ambiguous on several points. Here are the assumptions I made and the reasoning behind them.

**The domain is closed-world, not retrieval-augmented over the open web.** Every answer must come from the indexed document set — no general knowledge fill-in. This drove the dual-guard design: scope-lock rejects out-of-domain questions before retrieval, and the output guard rejects answers without citations.

**Citations are non-negotiable.** A response without a `[source:chunkId]` is treated as a failure, not a warning. This is enforced at the output guard layer and is the main reason the eval corpus exists.

**The agent is a tool the user controls, not a conversational partner.** Refusal is a feature, not a failure mode. Three terminal states (`COMPLETED`, `INSUFFICIENT_CONTEXT`, `REFUSED`) make refusal observable and testable.

**Multi-iteration retry is bounded.** Allowing indefinite retries would hide real failures behind eventual-success noise. Capping at 3 iterations (configurable) makes timeout behavior explicit.

**Typed contracts at every boundary.** Every input and output between layers is Zod-validated. This makes the orchestrator impossible to misuse from outside.

## Scope: Must Ship vs. Defer

**Must ship (in this pass):**
- Six-layer read-only pipeline with explicit terminal states
- Pluggable `LlmProvider` and `RetrievalTool` interfaces
- Zod schemas at every boundary
- Input guard (heuristic + LLM), scope lock, output guard (citation check)
- Versioned prompt registry with template renderer
- Eval corpus with golden, injection, and scope cases
- Mock providers so the test suite runs without API keys

**Deferred (intentionally not built):**
- Real semantic retrieval — in-memory TF-IDF only, swappable via the interface
- Streaming responses — not required for the take-home
- Persistent storage / sessions
- Authentication / rate limiting
- A mutating tier (write-back to docs) and external tool protocol — only sketched

The reasoning: each deferred item requires a category of decision (e.g., persistence requires a database choice; auth requires an authorization model) that's outside the bounded problem of "answer questions with citations."

## Mini Design Notes

**1. Terminal states.** Three states — `COMPLETED`, `INSUFFICIENT_CONTEXT`, `REFUSED` — instead of a single `Answer` type with optional fields. Each state carries its own typed reason and triggering layer. This makes refusal observable in logs and tests, and avoids the silent-failure pattern where an empty `answer` field is interpreted as success.

**2. Guardrail strategy.** Three independent guards, not one big validator. Input guard runs heuristics *before* calling the LLM to save cost on obvious attacks. Scope lock runs *after* retrieval so it can use the domain description as context. Output guard runs *after* generation so it can verify the actual LLM output. Each guard fails closed — if it can't verify safety, it blocks. This is more conservative than necessary but matches the take-home's bias toward refusal over fluency.

**3. Provider abstraction.** Two interfaces — `LlmProvider` and `RetrievalTool` — implemented by Anthropic/real/mock pairs. The orchestrator depends only on the interfaces, so swapping Anthropic for OpenAI or in-memory for Pinecone is a constructor change, not a refactor. The mock implementations exist specifically so the test suite runs offline.

**4. Eval corpus design.** Three categories of test cases. Golden cases assert grounded answer + citations. Injection cases assert input guard refuses them. Scope cases assert scope lock refuses them. Each golden case is hand-written with an expected citation format so we can detect hallucinated chunk IDs. The corpus is small (12 + 5 + 4) but covers the main failure modes.

**5. Prompt registry.** Prompts are versioned, named objects with a template string and description. The renderer does string substitution on `{{variable}}` placeholders. This makes prompt changes diff-able and reviewable without the LLM definition becoming a string literal buried in code.

## Extension: Mutating Tier and External Tool Protocol

**Mutating tier.** The current design treats documents as immutable. A mutating tier (human-in-the-loop) would add a write layer with two changes: (1) every write action goes through a separate "ActionGuard" that requires explicit human approval before execution, and (2) the terminal-state model gains an `AWAITING_APPROVAL` state. The orchestrator's main loop would short-circuit on this state and persist the proposed action for review.

**External tool protocol.** A tool-protocol surface would mean the agent can call external APIs (e.g., `getJiraTicket(id)`) in addition to retrieval. This requires: (1) a `ToolRegistry` that maps tool names to implementations, (2) the orchestrator injecting tool descriptions into the answer-generation prompt, and (3) the output guard checking that any tool invocation in the response has a matching actual call result. The MCP (Model Context Protocol) surface from the prompts registry is a placeholder for this — `extend.tool_protocol` prompt version is reserved but unimplemented.

## What I'd Do Differently With Two More Weeks

**Stronger retrieval.** Replace TF-IDF with a real embedding-based retriever. The current in-memory retriever is fine for two documents but degrades fast. Embedding-based retrieval is a swap-out via the `RetrievalTool` interface — no orchestrator changes needed.

**Streaming + cancellation.** Stream the answer as the LLM generates it, with explicit cancellation on guard refusal. This is a UX improvement, not a correctness one.

**Bigger eval corpus.** Add more golden cases, especially edge cases (multi-hop questions, partial answers). Right now the corpus is small enough that a regression could slip through. A target of 50+ golden cases would give better coverage.

**Persistent traces.** The current `getTrace()` returns an in-memory array. Persisting traces (to file or DB) would make debugging easier and would enable eval-time analysis of which layer most often triggers refusal.

**Concurrent evaluation.** The eval runner is sequential. Running cases in parallel (with rate limiting) would cut eval time significantly. Right now it's a CI-cost optimization, not a correctness one.

**Provider-side retry + backoff.** `AnthropicProvider.generate()` has no retry. A production version would retry on 429/5xx with exponential backoff. Defer is fine because the test suite uses mocks.

**Real semantic guard for input.** The current input guard uses regex heuristics plus an LLM check. A real production version would use a dedicated small classifier trained on jailbreak patterns, not the same LLM as the answer generator.

**Integration tests with real API.** Mock-based tests verify the code paths but not the LLM behavior. A small smoke-test suite that runs against the real Anthropic API (gated to non-CI, manual run) would catch prompt regressions.

## Running Tests and Eval

**Run all tests:**
```bash
npm test
```

**Run a single test file:**
```bash
npx vitest run tests/unit/all.test.ts
```

**Watch mode:**
```bash
npx vitest
```

**Type check:**
```bash
npm run typecheck
```

**Lint:**
```bash
npm run lint
```

The test suite uses `MockLlmProvider` and `MockRetrieval` so no API key is required. Tests cover schemas, providers, guardrails, prompts, retrieval, orchestrator, and the eval-corpus structure.

## What I Intentionally Didn't Test

A few things are deliberately outside the automated test suite:

- **Live LLM behavior.** I don't have a CI-stable way to assert that Claude will answer a golden case correctly across model versions. The mocked golden-path test verifies the *code path*, not the LLM's actual output. A real eval would require running against the live API with versioned test expectations.

- **Performance / latency.** No tests assert that `run()` completes within a time budget. This would be flaky on CI; better handled with separate perf benchmarks.

- **Real embedding-based retrieval.** The mock retrieval uses cosine similarity on a small set, which doesn't stress-test the in-memory retrieval under a realistic corpus (10k+ chunks).

- **Concurrent runs.** The orchestrator is documented as supporting one run at a time per instance. Concurrent invocations are not part of the contract.

- **Prompt regression.** A prompt change can degrade answer quality without breaking any test. Detecting this requires a live LLM run, which I deliberately kept out of CI.

The test suite verifies the code paths and the deterministic parts of the pipeline. The non-deterministic parts (LLM behavior, real retrieval quality) are verified manually or in a separate live-eval process that isn't part of this repo.
