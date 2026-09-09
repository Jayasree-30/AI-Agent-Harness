import type { Chunk } from "../contracts/schemas";

export interface RetrievalTool {
 retrieve(query: string, topK?: number): Promise<{ chunks: Chunk[]; queryMs: number }>;
 addChunks(chunks: Chunk[]): Promise<void>;
 reset(): Promise<void>;
}
