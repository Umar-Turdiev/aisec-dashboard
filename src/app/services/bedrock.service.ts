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
  /** Helper: parse model JSON output, repairing common issues (double-encoded + truncated arrays) */
  private tryParseJSON<T = any>(text: string): T | null {
    if (!text) return null;

    // 1) Strip code fences if any
    let s = text.trim();
    if (s.startsWith('```')) {
      s = s.replace(/```[a-zA-Z]*\n?|```/g, '').trim();
    }

    // 2) Try to de-stringify up to 3 layers (handles "\"escaped\"" arrays)
    for (let i = 0; i < 3; i++) {
      if (typeof s === 'string') {
        try {
          const parsed = JSON.parse(s);
          s = parsed as any;
        } catch {
          break;
        }
      }
    }

    // 3) If it’s now an object/array, return it
    if (typeof s === 'object') return s as T;

    // 4) If it’s still a string, try a normal parse once more
    if (typeof s === 'string') {
      try {
        return JSON.parse(s) as T;
      } catch {
        // fall through to repair attempt
      }
    }

    // 5) Last resort: repair a likely truncated JSON array
    const repaired = this.repairLikelyJSONArray(
      typeof s === 'string' ? s : String(s)
    );
    if (repaired) {
      try {
        return JSON.parse(repaired) as T;
      } catch {
        // give up
      }
    }

    return null;
  }

  /** Attempt to repair a truncated JSON array by dropping the last incomplete element and closing brackets */
  private repairLikelyJSONArray(s: string): string | null {
    const str = s.trim();

    // Only attempt on something that looks like a JSON array
    const firstBracket = str.indexOf('[');
    if (firstBracket === -1) return null;

    // Walk and keep bracket/quote state; stop at last *balanced* position
    let depth = 0;
    let inStr = false;
    let esc = false;
    let lastBalancedIdx = -1;

    for (let i = firstBracket; i < str.length; i++) {
      const ch = str[i];

      if (inStr) {
        if (esc) {
          esc = false;
        } else if (ch === '\\') {
          esc = true;
        } else if (ch === '"') {
          inStr = false;
        }
      } else {
        if (ch === '"') inStr = true;
        else if (ch === '[' || ch === '{') depth++;
        else if (ch === ']' || ch === '}') depth = Math.max(0, depth - 1);

        if (depth === 0) lastBalancedIdx = i;
      }
    }

    // If we never reached balance, try cutting at last '}' or ']'
    let cutIdx =
      lastBalancedIdx >= 0
        ? lastBalancedIdx
        : Math.max(str.lastIndexOf(']'), str.lastIndexOf('}'));

    if (cutIdx < 0) return null;

    let candidate = str.slice(0, cutIdx + 1);

    // Ensure it ends with a closing array bracket
    // If last char is '}', we may need to add a ']'
    const trimmed = candidate.trimEnd();
    if (!trimmed.endsWith(']')) {
      // Remove trailing commas before closing
      candidate = candidate.replace(/,\s*$/, '');
      candidate += ']';
    }

    // Also ensure it *starts* at the first '['
    candidate = candidate.slice(firstBracket);

    // Quick sanity: must start with '[' and end with ']'
    const ctrim = candidate.trim();
    if (!(ctrim.startsWith('[') && ctrim.endsWith(']'))) return null;

    return ctrim;
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
