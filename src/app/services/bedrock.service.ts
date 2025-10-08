import { Injectable } from '@angular/core';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { environment } from '../../environments/environment';

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
}
