import { Injectable, computed, signal } from '@angular/core';

import { Finding, ToolKind } from '../models/finding.model';
import { environment } from '../../environments/environment';

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

  loadMockFindings() {
    const mock: Finding[] = [
      {
        id: 'semgrep-001',
        tool: 'semgrep',
        ruleId: 'rules.agent-security.ai.agent.unbounded-loop.py',
        title: 'Unbounded agent loop',
        message:
          'Agent loop without max iterations / timeouts. Add guards. (Agentic T4 / LLM04)',
        severity: 'medium',
        location: {
          file: 'repo/src/requests/models.py',
          line: 831,
          snippet: `while True:
    chunk = self.raw.read(chunk_size)
    if not chunk:
        break
    yield chunk`,
        },
        aiExplanation:
          'An infinite loop without timeout controls could lead to resource exhaustion if the stream never ends or if an attacker sends an endless stream.',
        aiRemediation:
          '- Add a maximum iteration counter\n- Enforce total elapsed time using time.time()\n- Add size limits and handle interruptions\n- Exit loop when thresholds are reached',
      },
      {
        id: 'semgrep-002',
        tool: 'semgrep',
        ruleId: 'rules.agent-security.ai.llm.output.to.shell.python',
        title: 'LLM output to shell',
        message:
          'LLM output flows into a shell command. Validate/whitelist or sandbox. (OWASP LLM02)',
        severity: 'high',
        location: {
          file: 'repo/setup.py',
          line: 32,
          snippet: 'os.system("python setup.py sdist bdist_wheel")',
        },
        aiExplanation:
          'Passing LLM output into a shell can allow command injection. Attackers could execute arbitrary commands.',
        aiRemediation:
          '- Replace os.system with subprocess.run(..., shell=False)\n- Use argument arrays instead of shell strings\n- Strictly validate/whitelist commands',
      },
      {
        id: 'semgrep-003',
        tool: 'semgrep',
        ruleId: 'py.insecure.hash.md5',
        title: 'MD5 used for hashing',
        message: 'Insecure hash (MD5) used for security-sensitive context.',
        severity: 'low',
        location: {
          file: 'repo/auth/utils.py',
          line: 44,
          snippet: 'h = hashlib.md5(password.encode()).hexdigest()',
        },
        aiExplanation:
          'MD5 is broken and collision-prone. It should not be used for passwords or integrity checks.',
        aiRemediation:
          '- Use hashlib.sha256 or scrypt/argon2 for passwords\n- Add per-user salt\n- Prefer a proper KDF (argon2, scrypt, PBKDF2)',
      },
      {
        id: 'semgrep-002',
        tool: 'semgrep',
        ruleId: 'rules.agent-security.ai.llm.output.to.shell.python',
        title: 'LLM output to shell',
        message:
          'LLM output flows into a shell command. Validate/whitelist or sandbox. (OWASP LLM02)',
        severity: 'high',
        location: {
          file: 'repo/setup.py',
          line: 32,
          snippet: 'os.system("python setup.py sdist bdist_wheel")',
        },
        aiExplanation:
          'Passing LLM output into a shell can allow command injection. Attackers could execute arbitrary commands.',
        aiRemediation:
          '- Replace os.system with subprocess.run(..., shell=False)\n- Use argument arrays instead of shell strings\n- Strictly validate/whitelist commands',
      },
      {
        id: 'semgrep-003',
        tool: 'semgrep',
        ruleId: 'py.insecure.hash.md5',
        title: 'MD5 used for hashing',
        message: 'Insecure hash (MD5) used for security-sensitive context.',
        severity: 'low',
        location: {
          file: 'repo/auth/utils.py',
          line: 44,
          snippet: 'h = hashlib.md5(password.encode()).hexdigest()',
        },
        aiExplanation:
          'MD5 is broken and collision-prone. It should not be used for passwords or integrity checks.',
        aiRemediation:
          '- Use hashlib.sha256 or scrypt/argon2 for passwords\n- Add per-user salt\n- Prefer a proper KDF (argon2, scrypt, PBKDF2)',
      },
      {
        id: 'vanta-001',
        tool: 'vanta',
        ruleId: 'VANTA-AC-2',
        title: 'Access review missing',
        message: 'Quarterly access review not recorded for engineering group.',
        severity: 'medium',
        location: {
          file: 'controls/access-review.md',
          line: 12,
          snippet: '- Q3: pending',
        },
        aiExplanation:
          'Missing periodic access reviews can leave stale or excessive permissions in place.',
        aiRemediation:
          '- Perform quarterly access reviews\n- Remove inactive accounts\n- Document approvals in the system of record',
      },
      {
        id: 'harness-001',
        tool: 'harness',
        ruleId: 'HARNESS-CI-IMAGE-TAG-LATEST',
        title: 'Mutable image tag in pipeline',
        message: 'Pipeline uses :latest image tag, which is not immutable.',
        severity: 'medium',
        location: {
          file: 'pipelines/build.yaml',
          line: 73,
          snippet: 'image: myorg/api:latest',
        },
        aiExplanation:
          'Using :latest makes builds non-reproducible and risks pulling unexpected images.',
        aiRemediation:
          '- Pin images to a digest (sha256:...)\n- Use immutable version tags per release',
      },
      {
        id: 'semgrep-004',
        tool: 'semgrep',
        ruleId: 'python.sqlalchemy.raw-sql',
        title: 'Raw SQL string',
        message:
          'Potential SQL injection via formatted SQL string. Use bound parameters.',
        severity: 'critical',
        location: {
          file: 'repo/db/queries.py',
          line: 19,
          snippet: 'db.execute(f"SELECT * FROM users WHERE email=\'{email}\'")',
        },
        aiExplanation:
          'Formatting user input directly into SQL enables injection attacks and data exfiltration.',
        aiRemediation:
          '- Use parameterized queries (db.execute("... WHERE email=:email", {"email": email}))\n- Validate inputs server-side',
      },
    ];

    this._all.set(mock);

    // Optional: simulate latency so spinners can be tested
    // setTimeout(() => this._all.set(mock), 600);
  }

  /** call this once at app start if flag is on */
  initDevMockIfEnabled() {
    if (environment.demo.mockMode) this.loadMockFindings();
  }
}
