// Public API — import from here instead of deep paths
export { Orchestrator, createOrchestrator, seedKnowledgeBase, type OrchestratorConfig } from "./orchestrator/index.js";
export { GeminiProvider, MockLlmProvider, type LlmProvider, type LlmMessage, type LlmResponse } from "./providers/llm/index.js";
export { InMemoryRetrieval, MockRetrieval } from "./providers/retrieval/index.js";
export { InputGuard, OutputGuard, ScopeLock } from "./guardrails/index.js";
export { getPrompt, renderTemplate, listPrompts } from "./prompts/registry.js";
