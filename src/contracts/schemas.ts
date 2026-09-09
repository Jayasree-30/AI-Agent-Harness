// Layer 1: Typed Contracts
import { z } from "zod";

export const QuestionSchema = z.object({
 text: z.string().min(1).max(500),
 userId: z.string().optional(),
 sessionId: z.string().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

export const ChunkSchema = z.object({
 id: z.string(),
 documentId: z.string(),
 content: z.string(),
 score: z.number().min(0).max(1),
 metadata: z.record(z.unknown()).optional(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const RetrievedChunksSchema = z.object({
 query: z.string().max(500),
 chunks: z.array(ChunkSchema),
 retrievalMs: z.number().nonnegative(),
});
export type RetrievedChunks = z.infer<typeof RetrievedChunksSchema>;

export const GroundedContextSchema = z.object({
 chunks: z.array(ChunkSchema),
 isRelevant: z.boolean(),
 reasoning: z.string().optional(),
});
export type GroundedContext = z.infer<typeof GroundedContextSchema>;

export const CitationSchema = z.object({
 chunkId: z.string(),
 excerpt: z.string(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const AnswerSchema = z.object({
 question: z.string().max(500),
 answer: z.string(),
 citations: z.array(CitationSchema),
 confidence: z.enum(["high", "medium", "low"]),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const TerminalStateSchema = z.discriminatedUnion("status", [
 z.object({ status: z.literal("COMPLETED"), answer: AnswerSchema, iteration: z.number().int().nonnegative() }),
 z.object({ status: z.literal("INSUFFICIENT_CONTEXT"), reason: z.string().max(500), trigger: z.enum(["input_guard", "output_guard", "scope_lock", "max_iterations"]).optional(), iteration: z.number().int().nonnegative() }),
 z.object({ status: z.literal("REFUSED"), reason: z.string().max(500), trigger: z.enum(["input_guard", "output_guard", "scope_lock", "max_iterations"]) }),
]);
export type TerminalState = z.infer<typeof TerminalStateSchema>;

export interface RunStep {
 label: string;
 startedAt: number;
 finishedAt: number;
 metadata?: Record<string, unknown>;
}

export const OrchestratorInputSchema = QuestionSchema;
export type OrchestratorInput = z.infer<typeof OrchestratorInputSchema>;
export const OrchestratorOutputSchema = TerminalStateSchema;
export type OrchestratorOutput = z.infer<typeof OrchestratorOutputSchema>;
