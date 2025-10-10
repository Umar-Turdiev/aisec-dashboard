import { Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';

import { FindingsService } from '../../services/findings.service';
import type { Finding } from '../../models/finding.model';
import { ChatService } from '../../services/chat.service';

type SortKey = 'severity' | 'rule' | 'file';

@Component({
  selector: 'app-vulnerabilities',
  templateUrl: './vulnerabilities.component.html',
  styleUrls: ['./vulnerabilities.component.scss'],
  encapsulation: ViewEncapsulation.None,
  animations: [
    trigger('popIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('1s cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1 })),
      ]),
    ]),
  ],
})
export class VulnerabilitiesComponent {
  private store = inject(FindingsService);
  private chat = inject(ChatService);

  langOf(file?: string | null): string | undefined {
    const ext = (file || '').split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py':
        return 'python';
      case 'ts':
        return 'typescript';
      case 'js':
        return 'javascript';
      case 'tsx':
        return 'tsx';
      case 'jsx':
        return 'jsx';
      case 'go':
        return 'go';
      case 'rs':
        return 'rust';
      case 'rb':
        return 'ruby';
      case 'java':
        return 'java';
      case 'cs':
        return 'csharp';
      case 'c':
        return 'c';
      case 'cpp':
      case 'cc':
      case 'cxx':
        return 'cpp';
      case 'sh':
      case 'bash':
        return 'bash';
      case 'yml':
      case 'yaml':
        return 'yaml';
      case 'json':
        return 'json';
      case 'sql':
        return 'sql';
      default:
        return undefined; // let hljs auto-detect
    }
  }

  sortBy = signal<SortKey>('severity');

  private sevRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
    unknown: 5,
  };

  findings = computed(() => {
    const list = this.store.all();
    const sort = this.sortBy();
    const bySev = (a: Finding, b: Finding) =>
      (this.sevRank[a.severity] ?? 9) - (this.sevRank[b.severity] ?? 9) ||
      (a.ruleId || '').localeCompare(b.ruleId || '');
    const byRule = (a: Finding, b: Finding) =>
      (a.ruleId || '').localeCompare(b.ruleId || '');
    const byFile = (a: Finding, b: Finding) =>
      (a.location?.file || '').localeCompare(b.location?.file || '');

    const copy = [...list];
    if (sort === 'severity') copy.sort(bySev);
    if (sort === 'rule') copy.sort(byRule);
    if (sort === 'file') copy.sort(byFile);
    return copy;
  });

  trackById = (_: number, f: Finding) => f.id;

  onSortChange(ev: Event) {
    const value = (ev.target as HTMLSelectElement).value as SortKey;
    this.sortBy.set(value);
  }

  badgeClass(sev: string): string {
    switch (sev) {
      case 'critical':
        return 'badge badge--crit';
      case 'high':
        return 'badge badge--high';
      case 'medium':
        return 'badge badge--med';
      case 'low':
        return 'badge badge--low';
      case 'info':
        return 'badge badge--info';
      default:
        return 'badge';
    }
  }

  askAiToFix(finding: any) {
    const prompt = `
When replying, please use markdown formatting for headers, please start with heading-2

Please analyze and fix the following vulnerability:

Rule: ${finding.ruleId}
Severity: ${finding.severity}
Message: ${finding.message}
File: ${finding.location?.file}:${finding.location?.line}
Snippet:
${finding.location?.snippet}

Generate a secure code fix and explain the changes.`;
    this.chat.sendToChat(prompt);
  }
}
