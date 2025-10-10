import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Observable,
  Subscription,
  interval,
  map,
  of,
  startWith,
  switchMap,
  takeWhile,
  tap,
} from 'rxjs';

import { environment } from '../../environments/environment';
import {
  isSarif,
  mapSemgrepSarifToFindings,
} from '../models/semgrep.sarif.mapper';
import type { Finding, ToolKind } from '../models/finding.model';
import { FindingsService } from './findings.service';
import { BedrockService } from './bedrock.service';

/* -----------------------------
   Scanner Adapter Abstraction
--------------------------------*/
interface ScannerAdapter {
  tool: ToolKind;

  // endpoints (can read from environment or be hardcoded per tool)
  startUrl: string;
  logsUrl: string;
  resultUrl: string;

  // how to detect the result filename from logs
  resultFilePattern: RegExp;

  // optional: convert the tool’s raw result JSON into your Finding[]
  mapResultToFindings(payload: unknown, ctx: { repo?: string }): Finding[];
}

/* -----------------------------
   Semgrep Adapter (uses existing env)
--------------------------------*/
const SemgrepAdapter: ScannerAdapter = {
  tool: 'semgrep',
  startUrl: environment.lambdaEndpoints.startScanUrl,
  logsUrl: environment.lambdaEndpoints.scannerLogsUrl,
  resultUrl: environment.lambdaEndpoints.fetchResultUrl,
  resultFilePattern:
    /semgrep-results-[a-zA-Z0-9._-]+-[a-zA-Z0-9._-]+-\d{8}T\d{6}Z\.json/i,

  mapResultToFindings(payload: any, ctx): Finding[] {
    // If it looks like SARIF, map it deterministically
    if (isSarif(payload)) {
      return mapSemgrepSarifToFindings(payload, ctx);
    }

    // Else, try to coerce a flattened array you may already return
    if (Array.isArray(payload)) {
      return payload.map((r: any, i: number) => ({
        id: r.id ?? `semgrep-${i}`,
        tool: 'semgrep',
        ruleId: r.ruleId ?? 'rule',
        message: r.message?.text ?? r.message ?? '',
        severity: (r.severity as any) ?? 'unknown',
        location: {
          file:
            r.location?.file ??
            r.locations?.[0]?.physicalLocation?.artifactLocation?.uri,
          line:
            r.location?.line ??
            r.locations?.[0]?.physicalLocation?.region?.startLine,
          snippet:
            r.location?.snippet ??
            r.locations?.[0]?.physicalLocation?.region?.snippet?.text,
        },
        fingerprints: r.fingerprints,
        raw: r,
      })) as Finding[];
    }

    return [];
  },
};

/* -----------------------------
   Adapter registry
--------------------------------*/
const ADAPTERS: Record<ToolKind, ScannerAdapter> = {
  semgrep: SemgrepAdapter,
  vanta: {
    tool: 'vanta',
    startUrl: '', // TODO: wire when ready
    logsUrl: '',
    resultUrl: '',
    resultFilePattern: /vanta-results-.*\.json/i,
    mapResultToFindings: () => [],
  },
  harness: {
    tool: 'harness',
    startUrl: '', // TODO: wire when ready
    logsUrl: '',
    resultUrl: '',
    resultFilePattern: /harness-results-.*\.json/i,
    mapResultToFindings: () => [],
  },
};

/* -----------------------------
   Service
--------------------------------*/
export type ScanPhase =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'completed'
  | 'error';

export interface StartScanResponse {
  taskId: string;
  startedAt: string;
  repo: string;
}

export interface LogChunk {
  lines: string[];
  end: boolean;
  cursor?: string;
}

@Injectable({ providedIn: 'root' })
export class ScanService {
  private http = inject(HttpClient);
  constructor(
    private findingsStore: FindingsService,
    private bedrock: BedrockService
  ) {}

  // current session (task + repo + tool)
  readonly scanSession = signal<{
    taskId: string;
    repo: string;
    tool: ToolKind;
  } | null>(null);
  readonly scanPhase = signal<ScanPhase>('idle');
  readonly resultFile = signal<string | null>(null);

  // ✅ central log buffer for UI to read
  readonly logs = signal<string[]>([]);

  // ✅ the live polling subscription lives here (not in a component)
  private logSub?: Subscription;

  /** Start a scan for a tool (defaults to semgrep for backward compatibility) */
  startScan(input: string, tool: ToolKind): Observable<StartScanResponse> {
    const a = ADAPTERS[tool];
    let v = String(input || '').trim();
    if (!/^https?:\/\//i.test(v)) v = `https://github.com/${v}`;
    v = v.replace(/\.git$/i, '').replace(/\/+$/g, '');

    this.scanPhase.set('starting');
    return this.http.post<StartScanResponse>(
      a.startUrl,
      { repoUrl: v, raw: input },
      { headers: { 'Content-Type': 'application/json', 'X-Target-Repo': v } }
    );
  }

  /** Mark started so the shell can switch */
  markStarted(res: StartScanResponse, tool: ToolKind) {
    this.scanSession.set({ taskId: res.taskId, repo: res.repo, tool });
    this.scanPhase.set('scanning');
  }

  clearSession() {
    this.scanSession.set(null);
    this.scanPhase.set('idle');
    this.resultFile.set(null);
  }

  /** Poll logs for a given taskId and tool, detect result file, then fetch it */
  streamLogs(taskId: string, tool: ToolKind) {
    const a = ADAPTERS[tool];
    let cursor = '';

    return interval(1200).pipe(
      startWith(0),
      switchMap(() => {
        let params = new HttpParams().set('taskId', taskId);
        if (cursor) params = params.set('cursor', cursor);
        return this.http.get<LogChunk>(a.logsUrl, { params });
      }),
      map((ch) => {
        cursor = ch.cursor || cursor;
        return ch;
      }),
      takeWhile((ch) => !ch.end, true),
      map((ch) => ch.lines),
      tap((lines) => {
        for (const line of lines) {
          const match = line.match(a.resultFilePattern);
          if (match) {
            const filename = match[0];
            console.log(`[${tool}] 🟡 Detected result file:`, filename);
            this.resultFile.set(filename);

            // fetch results (console log only as requested)
            const params = new HttpParams().set('name', filename);
            this.http.get(a.resultUrl, { params }).subscribe({
              next: (res) => {
                console.log(`[${tool}] ✅ Result Lambda response:`, res);

                // 1) Normalize to Finding[]
                const ctx = {
                  repo: this.scanSession()?.repo,
                  createdAt: new Date().toISOString(),
                };
                let normalized: Finding[] = [];
                if (tool === 'semgrep') {
                  normalized = isSarif(res)
                    ? mapSemgrepSarifToFindings(res, ctx)
                    : a.mapResultToFindings(res, ctx);
                } else {
                  normalized = a.mapResultToFindings(res, ctx);
                }

                if (!normalized.length) {
                  console.warn(`[${tool}] ℹ️ No findings after normalization.`);
                } else {
                  console.table(
                    normalized.map((n) => ({
                      tool: n.tool,
                      sev: n.severity,
                      rule: n.ruleId,
                      file: n.location?.file,
                      line: n.location?.line,
                    }))
                  );
                  this.findingsStore.add(normalized);
                }

                // 2) Enrich with AI (explanations + remediation)
                this.bedrock
                  .enrichFindings(normalized)
                  .then((enriched) => {
                    console.log('🤖 Enriched findings:', enriched);
                    // optional: persist enriched back to the store
                    this.findingsStore.add(enriched);

                    console.log(this.findingsStore.all());
                  })
                  .catch((e) => {
                    console.error('❌ AI enrichment failed:', e);
                  });

                this.scanPhase.set('completed');
              },
              error: (err) =>
                console.error(`[${tool}] ❌ Failed to fetch result:`, err),
            });
          }
        }
      })
    );
  }

  /** Start/replace polling and keep it alive even if components unmount */
  startLogPolling(taskId: string, tool: ToolKind) {
    // cancel previous if any
    this.logSub?.unsubscribe();
    this.logs.set(['Streaming logs...']);

    this.logSub = this.streamLogs(taskId, tool).subscribe({
      next: (lines) => {
        if (!lines?.length) return;
        this.logs.update((v) => v.concat(lines));
      },
      complete: () => {
        this.scanPhase.set('completed');
        this.logs.update((v) => [...v, 'Done.']);
      },
      error: (e) => {
        this.scanPhase.set('error');
        const msg = (
          e?.error?.message ||
          e?.message ||
          'Log stream error'
        ).toString();
        this.logs.update((v) => [...v, `Log stream error: ${msg}`]);
      },
    });
  }

  /** Optional: stop polling manually (e.g., Rescan) */
  stopLogPolling() {
    this.logSub?.unsubscribe();
    this.logSub = undefined;
  }

  /** Direct fetch if you already know the file name */
  fetchResult(name: string, tool: ToolKind): Observable<any> {
    const a = ADAPTERS[tool];
    const params = new HttpParams().set('name', name);
    return this.http.get(a.resultUrl, { params });
  }
}
