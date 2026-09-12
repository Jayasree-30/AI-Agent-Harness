import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

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
		modelName: string = "gemini-2.0-flash-exp"
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

		const result = await this.model.generateContent({ contents });
		const response = await result.response;
		const text = response.text();

		return {
			content: text,
			stopReason: "end_turn",
			usage: {
				inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
				outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
			},
		};
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

		const result = await this.model.generateContent({
			contents,
			generationConfig: {
				responseMimeType: "application/json",
			},
		});

		const response = await result.response;
		const raw = response.text();

		let parsed: T;
		try {
			parsed = JSON.parse(raw) as T;
		} catch {
			parsed = { answer: raw, citations: [], confidence: "low" } as T;
		}

		return { data: parsed, raw };
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
