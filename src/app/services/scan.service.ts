import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Observable,
  interval,
  map,
  of,
  startWith,
  switchMap,
  takeWhile,
  tap,
} from 'rxjs';

import { environment } from '../../environments/environment';
import type { Finding, ToolKind } from '../models/finding.model';

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
  // matches: semgrep-results-<owner>-<repo>-<YYYYMMDD>T<HHMMSS>Z.json
  resultFilePattern:
    /semgrep-results-[a-zA-Z0-9._-]+-[a-zA-Z0-9._-]+-\d{8}T\d{6}Z\.json/i,

  // For now, just mirror what your Lambda returns (already simplified).
  // Later: replace with a strict mapper to your Finding model.
  mapResultToFindings(payload: any, _ctx): Finding[] {
    // If Lambda already returns array shaped like your model, pass through.
    // Otherwise, map minimal fields for now.
    if (Array.isArray(payload)) {
      // Try to coerce into Finding minimally while preserving fields
      return payload.map((r, idx) => ({
        id: r.id ?? `semgrep-${idx}`,
        tool: 'semgrep',
        ruleId: r.ruleId ?? 'rule',
        message: r.message?.text ?? r.message ?? '',
        severity: (r.severity as any) ?? (r.level as any) ?? 'unknown',
        location: {
          file:
            r.locations?.[0]?.physicalLocation?.artifactLocation?.uri ??
            r.location?.file,
          line:
            r.locations?.[0]?.physicalLocation?.region?.startLine ??
            r.location?.line,
          snippet:
            r.locations?.[0]?.physicalLocation?.region?.snippet?.text ??
            r.location?.snippet,
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

  // current session (task + repo + tool)
  readonly scanSession = signal<{
    taskId: string;
    repo: string;
    tool: ToolKind;
  } | null>(null);
  readonly scanPhase = signal<ScanPhase>('idle');
  readonly resultFile = signal<string | null>(null);

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
                // (optional) normalize to your Finding[] later:
                // const normalized = a.mapResultToFindings(res, { repo: this.scanSession()?.repo });
                // console.log(`[${tool}] 🔎 Normalized findings:`, normalized);
              },
              error: (err) =>
                console.error(`[${tool}] ❌ Failed to fetch result:`, err),
            });
          }
        }
      })
    );
  }

  /** Direct fetch if you already know the file name */
  fetchResult(name: string, tool: ToolKind): Observable<any> {
    const a = ADAPTERS[tool];
    const params = new HttpParams().set('name', name);
    return this.http.get(a.resultUrl, { params });
  }
}
