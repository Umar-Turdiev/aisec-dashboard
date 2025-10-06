import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, of } from 'rxjs';

export interface StartScanResponse {
  taskId: string;
  startedAt: string;
  repo: string;
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

  // temporary stubs
  streamLogs(_: string): Observable<string[]> {
    return of([]);
  }
  fetchResult(_: string): Observable<any> {
    return of(null);
  }
}
