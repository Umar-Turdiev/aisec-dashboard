import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Observable,
  interval,
  map,
  of,
  startWith,
  switchMap,
  takeWhile,
} from 'rxjs';

import { environment } from '../../environments/environment';

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

  startScan(input: string): Observable<StartScanResponse> {
    let v = String(input || '').trim();
    if (!/^https?:\/\//i.test(v)) v = `https://github.com/${v}`;
    v = v.replace(/\.git$/i, '').replace(/\/+$/g, '');
    return this.http.post<StartScanResponse>(
      environment.api.startScanUrl,
      { repoUrl: v, raw: input },
      { headers: { 'Content-Type': 'application/json', 'X-Target-Repo': v } }
    );
  }

  streamLogs(taskId: string) {
    let cursor = '';
    return interval(1200).pipe(
      startWith(0),
      switchMap(() => {
        let params = new HttpParams().set('taskId', taskId);
        if (cursor) params = params.set('cursor', cursor);
        return this.http.get<LogChunk>(environment.api.logsUrl, { params }); // no headers, no body
      }),
      map((ch) => {
        cursor = ch.cursor || cursor;
        return ch;
      }),
      takeWhile((ch) => !ch.end, true),
      map((ch) => ch.lines)
    );
  }

  fetchResult(_: string): Observable<any> {
    return of(null);
  }
}
