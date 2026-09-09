import { describe, it, expect } from "vitest";
import { QuestionSchema, ChunkSchema, AnswerSchema, TerminalStateSchema } from "../../src/contracts/schemas";

describe("Contracts", () => {
 it("accepts a valid question", () => {
 expect(() => QuestionSchema.parse({ text: "What is the remote work policy?" })).not.toThrow();
 expect(() => QuestionSchema.parse({ text: "hi", userId: "u1" })).not.toThrow();
 });

 it("rejects empty or long text", () => {
 expect(() => QuestionSchema.parse({ text: "" })).toThrow();
 expect(() => QuestionSchema.parse({ text: "x".repeat(501) })).toThrow();
 });

 it("accepts a valid chunk", () => {
 expect(() => ChunkSchema.parse({ id: "c1", documentId: "d1", content: "Remote work policy", score: 0.9 })).not.toThrow();
 });

 it("rejects chunk scores outside [0, 1]", () => {
 expect(() => ChunkSchema.parse({ id: "c1", documentId: "d1", content: "x", score: 1.5 })).toThrow();
 expect(() => ChunkSchema.parse({ id: "c1", documentId: "d1", content: "x", score: -0.1 })).toThrow();
 });

 it("accepts valid COMPLETED terminal state", () => {
 const state = { status: "COMPLETED" as const, answer: { question: "Q?", answer: "A.", citations: [], confidence: "medium" as const }, iteration: 1 };
 expect(() => TerminalStateSchema.parse(state)).not.toThrow();
 });

 it("accepts valid REFUSED terminal state", () => {
 const state = { status: "REFUSED" as const, reason: "Out of scope", trigger: "scope_lock" as const };
 expect(() => TerminalStateSchema.parse(state)).not.toThrow();
 });

 it("accepts valid INSUFFICIENT_CONTEXT state", () => {
 const state = { status: "INSUFFICIENT_CONTEXT" as const, reason: "No chunks", iteration: 0 };
 expect(() => TerminalStateSchema.parse(state)).not.toThrow();
 });

 it("accepts a valid Answer", () => {
 expect(() => AnswerSchema.parse({ question: "Q?", answer: "A.", citations: [{ chunkId: "c1", excerpt: "..." }], confidence: "high" })).not.toThrow();
 });
});
