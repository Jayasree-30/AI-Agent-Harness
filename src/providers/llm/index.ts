import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

function isRetryableError(error: unknown): boolean {
	if (error instanceof Error) {
		const msg = error.message;
		return msg.includes("429") || msg.includes("500") || msg.includes("503") || msg.includes("Too Many Requests");
	}
	return false;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fn();
		} catch (error) {
			if (i < maxRetries - 1 && isRetryableError(error)) {
				await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
				continue;
			}
			throw error;
		}
	}
	throw new Error("Max retries exceeded");
}

export interface LlmMessage {
	role: "user" | "assistant" | "system";
	content: string;
}

export interface LlmResponse {
	content: string;
	stopReason: string;
	usage: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider {
	generate(messages: LlmMessage[]): Promise<LlmResponse>;
	generateWithJson<T>(messages: LlmMessage[], schemaDescription: string): Promise<{ data: T; raw: string }>;
}

export class GeminiProvider implements LlmProvider {
	private readonly model: GenerativeModel;

	constructor(
		private readonly genAI: GoogleGenerativeAI,
		modelName: string = "gemini-3.1-pro-preview"
	) {
		this.model = genAI.getGenerativeModel({ model: modelName });
	}

	async generate(messages: LlmMessage[]): Promise<LlmResponse> {
		const chatMsgs = messages.filter((m) => m.role !== "system");

		const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
		for (const m of chatMsgs) {
			contents.push({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{ text: m.content }],
			});
		}

		const result = await withRetry(async () => {
			const r = await this.model.generateContent({ contents });
			const response = await r.response;
			const text = response.text();
			return {
				content: text,
				stopReason: "end_turn",
				usage: {
					inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
					outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
				},
			} as LlmResponse;
		});

		return result;
	}

	async generateWithJson<T>(messages: LlmMessage[], _schemaDescription: string): Promise<{ data: T; raw: string }> {
		const sysMsg = messages.find((m) => m.role === "system");
		const chatMsgs = messages.filter((m) => m.role !== "system");

		const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

		if (sysMsg) {
			contents.push({
				role: "user",
				parts: [{ text: `[]\n${sysMsg.content}` }],
			});
			contents.push({
				role: "model",
				parts: [{ text: "Understood. I will follow these instructions." }],
			});
		}

		for (const m of chatMsgs) {
			contents.push({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{ text: m.content }],
			});
		}

		const { raw, data } = await withRetry(async () => {
			const result = await this.model.generateContent({
				contents,
				generationConfig: {
					responseMimeType: "application/json",
				},
			});

			const response = await result.response;
			const rawText = response.text();

			let parsed: T;
			try {
				parsed = JSON.parse(rawText) as T;
			} catch {
				const jsonMatch = rawText.match(/\{[\s\S]*\}/);
				if (jsonMatch) {
					try {
						parsed = JSON.parse(jsonMatch[0]) as T;
					} catch {
						parsed = { answer: rawText, citations: [], confidence: "low" } as T;
					}
				} else {
					parsed = { answer: rawText, citations: [], confidence: "low" } as T;
				}
			}

			return { raw: rawText, data: parsed };
		});

		return { raw, data };
	}
}

export class MockLlmProvider implements LlmProvider {
	constructor(private readonly responses: string[] = []) {}

	async generate(_messages: LlmMessage[]): Promise<LlmResponse> {
		const content = this.responses.shift() ?? "I don't have enough context.";
		return { content, stopReason: "end_turn", usage: { inputTokens: 100, outputTokens: 50 } };
	}

	async generateWithJson<T>(_messages: LlmMessage[], _schemaDescription: string): Promise<{ data: T; raw: string }> {
		const content = this.responses.shift() ?? '{"answer":"No data.","citations":[],"confidence":"low"}';
		let parsed: T;
		try { parsed = JSON.parse(content) as T; }
		catch { parsed = { answer: content, citations: [], confidence: "low" } as T; }
		return { data: parsed, raw: content };
	}
}
