import type { Chunk } from "../../contracts/schemas";
import type { RetrievalTool } from "../../tools/RetrievalTool";

function tokenize(text: string): string[] {
 return text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
 let dot = 0, normA = 0, normB = 0;
 for (const [key, valA] of a) { dot += valA * (b.get(key) ?? 0); normA += valA * valA; }
 for (const [, valB] of b) { normB += valB * valB; }
 if (normA === 0 || normB === 0) return 0;
 return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildVector(text: string): Map<string, number> {
 const freq = new Map<string, number>();
 for (const token of tokenize(text)) freq.set(token, (freq.get(token) ?? 0) + 1);
 return freq;
}

export class InMemoryRetrieval implements RetrievalTool {
 private chunks: Chunk[] = [];
 private readonly vectors = new Map<string, Map<string, number>>();

 async addChunks(chunks: Chunk[]): Promise<void> {
 this.chunks.push(...chunks);
 for (const chunk of chunks) this.vectors.set(chunk.id, buildVector(chunk.content));
 }

 async retrieve(query: string, topK = 5): Promise<{ chunks: Chunk[]; queryMs: number }> {
 const start = Date.now();
 const queryVec = buildVector(query);
 const scored = this.chunks
 .map((chunk) => ({ chunk, score: cosineSimilarity(queryVec, this.vectors.get(chunk.id) ?? new Map()) }))
 .filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topK)
 .map((s) => ({ ...s.chunk, score: s.score }));
 return { chunks: scored, queryMs: Date.now() - start };
 }

 async reset(): Promise<void> { this.chunks = []; this.vectors.clear(); }
}

export class MockRetrieval implements RetrievalTool {
 constructor(private readonly cannedChunks: Chunk[] = []) {}
 async addChunks(_chunks: Chunk[]): Promise<void> {}
 async retrieve(_query: string, topK = 5): Promise<{ chunks: Chunk[]; queryMs: number }> {
 return { chunks: this.cannedChunks.slice(0, topK), queryMs: 1 };
 }
 async reset(): Promise<void> {}
}
