import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ScanService, StartScanResponse } from '../../services/scan.service';
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
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  private fb = inject(FormBuilder);
  private scan = inject(ScanService);
  private destroyRef = inject(DestroyRef);

  phase = signal<Phase>('idle');
  taskId = signal<string | null>(null);
  logs = signal<string[]>([]);
  findings = signal<SarifResult[]>([]);
  toolName = signal<string>('Semgrep');
  errorText = signal<string>('');

  form = this.fb.group({
    repoUrl: ['', [Validators.required]], // no format validator
  });

  start(): void {
    if (this.phase() === 'starting' || this.phase() === 'scanning') return;

    this.phase.set('starting');
    this.logs.set(['Initializing scan...']);
    this.errorText.set('');
    this.findings.set([]);
    this.taskId.set(null);

    const raw = String(this.form.value.repoUrl || '');
    const normalized = raw.startsWith('http')
      ? raw.replace(/\.git$/i, '').replace(/\/+$/, '')
      : `https://github.com/${raw.replace(/\.git$/i, '').replace(/\/+$/, '')}`;

    this.scan.startScan(normalized).subscribe({
      next: (res) => {
        const shortId = res.taskId.split('/').pop() || res.taskId;
        this.taskId.set(res.taskId);
        this.phase.set('completed');
        this.logs.set([
          'Task started.',
          `taskId: ${res.taskId}`,
          `shortId: ${shortId}`,
          'Open CloudWatch log group /ecs/aisec-scanner and search by shortId.',
        ]);
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
    const sub = this.scan.streamLogs(taskId).subscribe({
      next: (lines) => this.logs.set(lines.length ? lines : ['(no logs yet)']),
      complete: () => {
        this.logs.update((v) => [...v, 'Collecting results...']);
        this.scan.fetchResult(taskId).subscribe({
          next: (sarif: SarifLog | null) => {
            if (sarif && sarif.runs?.length) {
              const run = sarif.runs[0];
              this.toolName.set(run.tool?.driver?.name ?? 'Semgrep');
              this.findings.set(run.results ?? []);
            }
            this.phase.set('completed');
            this.logs.update((v) => [...v, 'Done.']);
          },
          error: (e) => {
            this.phase.set('error');
            const msg = (
              e?.error?.message ||
              e?.message ||
              'Result fetch failed'
            ).toString();
            this.errorText.set(msg);
            this.logs.update((v) => [...v, `Result fetch failed: ${msg}`]);
          },
        });
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
