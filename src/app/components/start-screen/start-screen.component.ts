import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ScanService } from '../../services/scan.service';
import type { SarifLog, SarifResult } from '../../models/sarif.model';

type Phase = 'idle' | 'starting' | 'scanning' | 'completed' | 'error';

function canon(input: string): string {
  let v = (input || '').trim();
  if (!v) return v;
  // owner/repo → https://github.com/owner/repo
  if (!/^https?:\/\//i.test(v)) v = `https://github.com/${v}`;
  // drop trailing slash and .git
  v = v.replace(/\.git$/i, '').replace(/\/+$/g, '');
  return v;
}

@Component({
  selector: 'app-start-screen',
  templateUrl: './start-screen.component.html',
  styleUrls: ['./start-screen.component.scss'],
})
export class StartScreenComponent {
  private fb = inject(FormBuilder);
  private scan = inject(ScanService);
  private destroyRef = inject(DestroyRef);
  private gotAnyLogs = false;

  phase = signal<Phase>('idle');
  taskId = signal<string | null>(null);
  logs = signal<string[]>([]);
  findings = signal<SarifResult[]>([]);
  toolName = signal<string>('Semgrep');
  errorText = signal<string>('');

  form = this.fb.group({
    repoUrl: ['', [Validators.required]], // no format validator
  });

  constructor() {
    // React to detected result file
    effect(() => {
      const file = this.scan.resultFile();
      if (file) {
        console.log('📦 Result file detected in StartScreen:', file);
      }
    });
  }

  start(): void {
    if (this.phase() === 'starting' || this.phase() === 'scanning') return;

    this.phase.set('starting');
    this.logs.set(['Initializing scan...']);
    this.errorText.set('');
    this.findings.set([]);
    this.taskId.set(null);
    this.gotAnyLogs = false;

    const raw = String(this.form.value.repoUrl || '');
    const normalized = raw.startsWith('http')
      ? raw.replace(/\.git$/i, '').replace(/\/+$/, '')
      : `https://github.com/${raw.replace(/\.git$/i, '').replace(/\/+$/, '')}`;

    this.scan.startScan(normalized, 'semgrep').subscribe({
      next: (res) => {
        this.scan.markStarted(res, 'semgrep');

        this.taskId.set(res.taskId);
        this.phase.set('scanning');
        this.logs.set(['Streaming logs...']);
        this.streamLogsAndFinish(res.taskId); // <— start polling
      },
      error: (e) => {
        this.phase.set('error');
        const msg = (
          e?.error?.message ||
          e?.message ||
          'Start failed'
        ).toString();
        this.errorText.set(msg);
        this.logs.set([`Start failed: ${msg}`]);
      },
    });
  }

  private streamLogsAndFinish(taskId: string) {
    const sub = this.scan.streamLogs(taskId, 'semgrep').subscribe({
      next: (lines) => {
        if (!lines || lines.length === 0) {
          if (!this.gotAnyLogs) this.logs.set(['(no logs yet)']); // show once
          return; // keep existing content
        }
        if (!this.gotAnyLogs) {
          this.gotAnyLogs = true;
          // drop placeholder if present
          const cur = this.logs();
          if (cur.length === 1 && cur[0].includes('no log')) this.logs.set([]);
        }
        // append new chunk (don’t replace)
        this.logs.update((v) => v.concat(lines));
      },
      complete: () => {
        this.phase.set('completed');
        this.logs.update((v) => [...v, 'Done.']);
        // optional: collapse placeholder-only state
        if (!this.gotAnyLogs) this.logs.set(['(no logs emitted)']);
      },
      error: (e) => {
        this.phase.set('error');
        const msg = (
          e?.error?.message ||
          e?.message ||
          'Log stream error'
        ).toString();
        this.errorText.set(msg);
        this.logs.update((v) => [...v, `Log stream error: ${msg}`]);
      },
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  severityBadge(level?: string): string {
    switch (level) {
      case 'error':
        return 'badge badge--error';
      case 'warning':
        return 'badge badge--warn';
      default:
        return 'badge';
    }
  }

  artifactLoc(r?: SarifResult): string {
    const loc = r?.locations?.[0]?.physicalLocation;
    const file = loc?.artifactLocation?.uri ?? '';
    const line = loc?.region?.startLine ?? 0;
    return file ? `${file}:${line}` : '';
  }
}
