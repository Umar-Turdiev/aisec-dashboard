import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { BedrockService } from '../../services/bedrock.service';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

@Component({
  selector: 'app-ai-chatbox',
  templateUrl: './ai-chatbox.component.html',
  styleUrls: ['./ai-chatbox.component.scss'],
})
export class AiChatboxComponent {
  private bedrock = inject(BedrockService);
  @ViewChild('scroll') scrollRef!: ElementRef<HTMLDivElement>;

  temperature = 0.2;

  messages: Msg[] = [
    {
      role: 'system',
      content:
        'You are an AI security analyst for Semgrep/Vanta/Harness results. Be concise and actionable.',
    },
  ];

  draft = '';
  streaming = false;
  private abort = new AbortController();

  async send() {
    const text = this.draft.trim();
    if (!text || this.streaming) return;

    // push user
    this.messages.push({ role: 'user', content: text });
    this.draft = '';

    // create assistant bubble to stream into
    this.messages.push({ role: 'assistant', content: '' });
    this.scrollToEnd();

    // stream
    this.streaming = true;
    this.abort = new AbortController();

    try {
      const history = this.messages.filter(
        (m) => !(m.role === 'assistant' && !m.content.trim())
      ) as {
        role: 'system' | 'user' | 'assistant';
        content: string;
      }[];
      await this.bedrock.invokeStream(
        history,
        (delta) => {
          this.appendToAssistant(delta);
          queueMicrotask(() => this.scrollToEnd());
        },
        { temperature: this.temperature, abortSignal: this.abort.signal }
      );
    } catch (e: any) {
      this.messages.push({
        role: 'assistant',
        content: `[Error] ${e?.message ?? e}`,
      });
    } finally {
      this.streaming = false;
    }
  }

  stop() {
    if (this.streaming) this.abort.abort();
    this.streaming = false;
  }

  clear() {
    this.messages = this.messages.slice(0, 1); // keep system
  }

  private appendToAssistant(delta: string) {
    const last = this.messages[this.messages.length - 1];
    if (last?.role === 'assistant') last.content += delta;
  }

  private scrollToEnd() {
    const el = this.scrollRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
