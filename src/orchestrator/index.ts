import type { Chunk, RunStep, OrchestratorInput, OrchestratorOutput, Answer } from "../contracts/schemas";
import { QuestionSchema, AnswerSchema } from "../contracts/schemas";
import type { LlmProvider } from "../providers/llm/index.js";
import type { RetrievalTool } from "../tools/RetrievalTool";
import { InputGuard, OutputGuard, ScopeLock } from "../guardrails/index.js";
import { getPrompt, renderTemplate } from "../prompts/registry.js";

export interface OrchestratorConfig {
	maxIterations: number;
	domainDescription: string;
	topK: number;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
	maxIterations: 3,
	domainDescription: "",
	topK: 5,
};

export class Orchestrator {
	private steps: RunStep[] = [];
	private config: OrchestratorConfig;

	constructor(
		private readonly llm: LlmProvider,
		private readonly retrieval: RetrievalTool,
		private readonly inputGuard: InputGuard,
		private readonly outputGuard: OutputGuard,
		private readonly scopeLock: ScopeLock,
		config: Partial<OrchestratorConfig> = {}
	) {
		if (!config.domainDescription?.trim()) {
			throw new Error("domainDescription must be a non-empty string");
		}
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
		const validated = QuestionSchema.parse(input);
		const t = () => Date.now();
		this.steps.push({ label: "validate_input", startedAt: t(), finishedAt: t() });

		const inputCheck = await this.inputGuard.check(validated.text);
		if (inputCheck.blocked) {
			this.steps.push({
				label: "input_guard_blocked",
				startedAt: t(),
				finishedAt: t(),
				metadata: { reason: inputCheck.reason },
			});
			return { status: "REFUSED", reason: inputCheck.reason ?? "Input guard blocked", trigger: "input_guard" };
		}

		const scopeCheck = await this.scopeLock.check(validated.text);
		if (!scopeCheck.allowed) {
			this.steps.push({
				label: "scope_lock_blocked",
				startedAt: t(),
				finishedAt: t(),
				metadata: { reason: scopeCheck.reason },
			});
			return { status: "REFUSED", reason: scopeCheck.reason ?? "Out of scope", trigger: "scope_lock" };
		}

		for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
			const iterStart = t();

			const retrieved = await this.retrieval.retrieve(validated.text, this.config.topK);
			if (retrieved.chunks.length === 0) {
				this.steps.push({ label: "no_chunks", startedAt: iterStart, finishedAt: t(), metadata: { iteration } });
				return { status: "INSUFFICIENT_CONTEXT", reason: "No relevant chunks retrieved", iteration };
			}

			const grounded = await this.ground(validated.text, retrieved.chunks);
			if (!grounded.isRelevant) {
				this.steps.push({ label: "not_grounded", startedAt: iterStart, finishedAt: t(), metadata: { iteration } });
				continue;
			}

			const answer = await this.answer(validated.text, grounded.chunks);
			const outputCheck = await this.outputGuard.check(answer.answer);
			if (outputCheck.blocked) {
				this.steps.push({
					label: "output_guard_blocked",
					startedAt: iterStart,
					finishedAt: t(),
					metadata: { iteration, reason: outputCheck.reason },
				});
				continue;
			}

			this.steps.push({ label: "completed", startedAt: iterStart, finishedAt: t(), metadata: { iteration } });
			return { status: "COMPLETED", answer, iteration };
		}

		this.steps.push({ label: "max_iterations_reached", startedAt: t(), finishedAt: t() });
		return { status: "INSUFFICIENT_CONTEXT", reason: "Max iterations reached", iteration: this.config.maxIterations };
	}

	getTrace(): RunStep[] {
		return [...this.steps];
	}

	private async ground(question: string, chunks: Chunk[]): Promise<{ chunks: Chunk[]; isRelevant: boolean }> {
		const prompt = getPrompt("answer.grounding");
		const chunksText = chunks.map((c) => `[${c.id}] ${c.content.slice(0, 200)}`).join("\n\n");
		const rendered = renderTemplate(prompt.template, { question, chunks: chunksText });
		try {
			const response = await this.llm.generate([{ role: "user", content: rendered }]);
			const cleaned = response.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
			const parsed = JSON.parse(cleaned);
			const isRelevant = parsed.relevant ?? false;
			return { chunks, isRelevant };
		} catch {
			return { chunks, isRelevant: false };
		}
	}

	private async answer(question: string, chunks: Chunk[]): Promise<Answer> {
		const prompt = getPrompt("answer.main");
		const contextChunks = chunks
			.slice(0, 5)
			.map((c) => `[source:${c.id}] ${c.content.slice(0, 500)}`)
			.join("\n\n");
		const response = await this.llm.generate([
			{ role: "system", content: prompt.template },
			{
				role: "user",
				content: `Context:\n${contextChunks}\n\nQuestion: ${question}\n\nAnswer based ONLY on the context. Include citations in [source:chunkId] format.`,
			},
		]);

		const citationPattern = /\[source:([^\]]+)\]/g;
		const citations: { chunkId: string; excerpt: string }[] = [];
		let match: RegExpExecArray | null;
		while ((match = citationPattern.exec(response.content)) !== null) {
			const found = chunks.find((c) => c.id === match![1]);
			if (found && !citations.find((c) => c.chunkId === match![1])) {
				citations.push({ chunkId: match![1], excerpt: found.content.slice(0, 200) });
			}
		}
		const confidence: "high" | "medium" | "low" = citations.length >= 2 ? "high" : citations.length >= 1 ? "medium" : "low";
		const answer: Answer = { question, answer: response.content, citations, confidence };
		return AnswerSchema.parse(answer);
	}
}

export function createOrchestrator(
	llm: LlmProvider,
	retrieval: RetrievalTool,
	domainDescription: string,
	config?: Partial<OrchestratorConfig>
): Orchestrator {
	return new Orchestrator(
		llm,
		retrieval,
		new InputGuard(llm),
		new OutputGuard(llm),
		new ScopeLock(llm, domainDescription),
		{ ...config, domainDescription }
	);
}

export async function seedKnowledgeBase(
	retrieval: RetrievalTool,
	documents: Array<{ id: string; title: string; content: string }>
): Promise<void> {
	for (const doc of documents) {
		const words = doc.content.split(/\s+/);
		const chunkSize = 100;
		for (let i = 0; i < words.length; i += chunkSize) {
			await retrieval.addChunks([
				{
					id: `${doc.id}-chunk-${Math.floor(i / chunkSize)}`,
					documentId: doc.id,
					content: `${doc.title}\n\n${words.slice(i, i + chunkSize).join(" ")}`,
					score: 0,
				},
			]);
		}
	}
}
