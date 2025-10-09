import { Injectable, computed, signal } from '@angular/core';

import { Finding, ToolKind } from '../models/finding.model';

@Injectable({ providedIn: 'root' })
export class FindingsService {
  // all findings in one place
  private readonly _all = signal<Finding[]>([]);

  // public read-only views
  readonly all = computed(() => this._all());
  readonly count = computed(() => this._all().length);

  byTool = (tool: ToolKind) =>
    computed(() => this._all().filter((f) => f.tool === tool));

  // add or replace by id
  add(list: Finding[]) {
    if (!list?.length) return;
    const map = new Map(this._all().map((f) => [f.id, f]));
    for (const f of list) map.set(f.id, { ...map.get(f.id), ...f });
    this._all.set([...map.values()]);
  }

  // remove everything, or only one tool
  clear(tool?: ToolKind) {
    if (!tool) {
      this._all.set([]);
      return;
    }
    this._all.set(this._all().filter((f) => f.tool !== tool));
  }

  // update one finding by id
  patch(id: string, patch: Partial<Finding>) {
    this._all.update((arr) =>
      arr.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
  }
}
