import { Injectable } from '@angular/core';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { environment } from '../../environments/environment';
import { Finding } from '../models/finding.model';

export type Role = 'system' | 'user' | 'assistant';
export type Turn = { role: Role; content: string };

@Injectable({ providedIn: 'root' })
export class BedrockService {
  private client = new BedrockRuntimeClient({
    region: environment.aws.region,
    credentials: {
      accessKeyId: environment.bedrock.accessKeyId,
      secretAccessKey: environment.bedrock.secretAccessKey,
    },
  });

  // For InvokeModel*, pass the inference profile ID/ARN as modelId
  private modelId = environment.bedrock.inferenceProfileArn;

  /** Build Anthropic-compatible body (works with Claude 3.5 Sonnet v2 via profile) */
  private toAnthropicBody(
    history: Turn[],
    opts?: { maxTokens?: number; temperature?: number; topP?: number }
  ) {
    let system = '';
    const messages: Array<{
      role: 'user' | 'assistant';
      content: { type: 'text'; text: string }[];
    }> = [];

    for (const t of history) {
      if (t.role === 'system') {
        if (t.content?.trim()) system += (system ? '\n' : '') + t.content;
      } else {
        messages.push({
          role: t.role === 'assistant' ? 'assistant' : 'user',
          content: [{ type: 'text', text: t.content }],
        });
      }
    }

    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: opts?.maxTokens ?? 800,
      temperature: opts?.temperature ?? 0.2,
      top_p: opts?.topP ?? 0.9,
      system: system || undefined,
      messages,
    };
  }

  /** Non-streaming (optional, handy for quick checks) */
  async invokeOnce(
    history: Turn[],
    opts?: { maxTokens?: number; temperature?: number; topP?: number }
  ): Promise<string> {
    const body = this.toAnthropicBody(history, opts);
    const cmd = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });

    const res = await this.client.send(cmd);
    const text = new TextDecoder().decode(res.body as Uint8Array);
    try {
      const j = JSON.parse(text);
      // Anthropic returns { content: [{ text: '...' }], ... }
      return (
        (j?.content ?? []).map((c: any) => c.text).join('') ||
        j?.outputText ||
        text
      );
    } catch {
      return text;
    }
  }

  /** Streaming */
  async invokeStream(
    history: Turn[],
    onChunk: (delta: string) => void,
    opts?: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<string> {
    const body = this.toAnthropicBody(history, opts);
    const cmd = new InvokeModelWithResponseStreamCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });

    const res = await this.client.send(cmd, { abortSignal: opts?.abortSignal });

    let full = '';
    for await (const evt of res.body ?? []) {
      const bytes = (evt as any)?.chunk?.bytes as Uint8Array | undefined;
      if (!bytes) continue;

      const s = new TextDecoder().decode(bytes);
      try {
        const j = JSON.parse(s);
        // deltas usually appear as delta.text; sometimes content[0].text or outputText
        const delta =
          j?.delta?.text ?? j?.content?.[0]?.text ?? j?.outputText ?? '';
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      } catch {
        // tolerate partial frames
        full += s;
        onChunk(s);
      }
    }
    return full;
  }

  /** Helper: safely parse model JSON output */
  private tryParseJSON<T = any>(text: string): T | null {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /** Trim long fields so prompts stay small */
  private sanitizeForAI(
    findings: Finding[],
    maxSnippet = 800,
    maxMsg = 400
  ): Finding[] {
    return findings.map((f) => ({
      ...f,
      message: (f.message || '').slice(0, maxMsg),
      location: f.location
        ? {
            ...f.location,
            snippet: (f.location.snippet || '').slice(0, maxSnippet),
          }
        : undefined,
      // don’t send huge raw blobs
      raw: undefined,
    }));
  }

  /**
   * Enrich findings with AI:
   * adds aiExplanation + aiRemediation to each item and returns a new array.
   */
  async enrichFindings(findings: Finding[]): Promise<Finding[]> {
    const input = this.sanitizeForAI(findings);

    const system = `You are a senior application security analyst. Return clear, actionable guidance. Keep responses concise.`;

    const user = `Given the following findings JSON array, add three fields to each item:
- Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown';
- aiExplanation: one short paragraph (plain text) explaining the risk in simple terms.
- aiRemediation: 2-5 specific steps or code changes to fix or mitigate.

Rules:
- Do NOT change or remove any existing properties.
- Do NOT invent file paths or lines; only use what's provided.
- If information is missing, write 'Unknown' briefly—do not guess.
- Respond with JSON ONLY (the full modified array).

Findings:
${JSON.stringify(input, null, 2)}`;

    const text = await this.invokeOnce(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 1400, temperature: 0.2, topP: 0.9 }
    );

    const maybe = this.tryParseJSON<Finding[]>(text);
    if (!maybe || !Array.isArray(maybe)) {
      console.warn('⚠️ AI returned non-JSON or invalid array; raw:', text);
      return findings; // fall back gracefully
    }

    // Merge AI fields back by id to avoid losing anything
    const byId = new Map(findings.map((f) => [f.id, f]));
    for (const f of maybe) {
      const base = byId.get(f.id);
      if (base) {
        byId.set(f.id, {
          ...base,
          severity: (f as any).severity ?? base.severity,
          aiExplanation: (f as any).aiExplanation ?? base.aiExplanation,
          aiRemediation: (f as any).aiRemediation ?? base.aiRemediation,
        });
      }
    }
    return [...byId.values()];
  }
}
