import Anthropic from "@anthropic-ai/sdk";

function isRetryableError(error: unknown): boolean {
	if (error instanceof Anthropic.APIError) {
		return error.status === 429 || error.status === 500 || error.status === 503;
	}
	if (error instanceof Error) {
		return error.message.includes("429") || error.message.includes("500") || error.message.includes("503") || error.message.includes("rate_limit");
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

export class AnthropicProvider implements LlmProvider {
	private readonly client: Anthropic;
	private readonly model: string;

	constructor(
		apiKey: string,
		modelName: string = "claude-sonnet-4-5-20250929",
		baseURL?: string
	) {
		this.model = modelName;
		const clientConfig: { apiKey: string; dangerouslyAllowBrowser?: boolean } & Record<string, unknown> = { apiKey, dangerouslyAllowBrowser: true };
		if (baseURL) clientConfig.baseURL = baseURL;
		this.client = new Anthropic(clientConfig);
	}

	async generate(messages: LlmMessage[]): Promise<LlmResponse> {
		const sysMsg = messages.find((m) => m.role === "system");
		const chatMsgs = messages.filter((m) => m.role !== "system");

		const result = await withRetry(async () => {
			const response = await this.client.messages.create({
				model: this.model,
				max_tokens: 1024,
				system: sysMsg?.content,
				messages: chatMsgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
			});
			const text = response.content[0].type === "text" ? response.content[0].text : "";
			return {
				content: text,
				stopReason: response.stop_reason,
				usage: {
					inputTokens: response.usage.input_tokens,
					outputTokens: response.usage.output_tokens,
				},
			} as LlmResponse;
		});

		return result;
	}

	async generateWithJson<T>(messages: LlmMessage[], _schemaDescription: string): Promise<{ data: T; raw: string }> {
		const sysMsg = messages.find((m) => m.role === "system");
		const chatMsgs = messages.filter((m) => m.role !== "system");

		const result = await withRetry(async () => {
			const response = await this.client.messages.create({
				model: this.model,
				max_tokens: 1024,
				system: sysMsg?.content,
				messages: chatMsgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
			});
			const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";

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

		return result;
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
