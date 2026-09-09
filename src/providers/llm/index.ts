import Anthropic from "@anthropic-ai/sdk";

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
 constructor(
 private readonly client: Anthropic,
 private readonly model: string = "claude-haiku-4-5-20250514"
 ) {}

 async generate(messages: LlmMessage[]): Promise<LlmResponse> {
 const systemMsg = messages.find((m) => m.role === "system");
 const chatMsgs = messages.filter((m) => m.role !== "system");

 const response = await this.client.messages.create({
 model: this.model,
 max_tokens: 1024,
 system: systemMsg?.content,
 messages: chatMsgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
 });

 const textContent = response.content.find((c) => c.type === "text");
 return {
 content: textContent ? textContent.text : "",
 stopReason: response.stop_reason ?? "unknown",
 usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
 };
 }

 async generateWithJson<T>(messages: LlmMessage[], _schemaDescription: string): Promise<{ data: T; raw: string }> {
 const sysMsg = messages.find((m) => m.role === "system");
 const chatMsgs = messages.filter((m) => m.role !== "system");

 const response = await this.client.messages.create({
 model: this.model,
 max_tokens: 2048,
 system: sysMsg?.content,
 messages: chatMsgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
 });

 const textContent = response.content.find((c) => c.type === "text");
 const raw = textContent ? textContent.text : "";

 let parsed: T;
 try { parsed = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()) as T; }
 catch { parsed = { answer: raw, citations: [], confidence: "low" } as T; }

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
