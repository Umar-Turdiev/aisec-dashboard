import { Component, computed, inject } from '@angular/core';
import { ScanService } from './services/scan.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { FindingsService } from './services/findings.service';
import { HarnessFinding, VantaFinding } from './models/finding.model';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ transform: 'translateY(-50px)', opacity: 0 }),
        animate(
          '1.5s cubic-bezier(0.22, 1, 0.36, 1)',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
    ]),
    // Chat panel pops in on enter
    trigger('popIn', [
      transition(':enter', [
        style({ transform: 'scale(0.96)', opacity: 0 }),
        animate(
          '2s cubic-bezier(0.22, 1, 0.36, 1)',
          style({ transform: 'scale(1)', opacity: 1 })
        ),
      ]),
    ]),
  ],
})
export class AppComponent {
  private scan = inject(ScanService);
  private findings = inject(FindingsService);

  hasSession = computed(() => !!this.scan.scanSession());

  constructor() {
    this.findings.initDevMockIfEnabled(); // 👈 seeds fake data for UI

    const harnessFindings: HarnessFinding[] = [
      {
        id: 'harness-001',
        tool: 'harness',
        ruleId: 'HARNESS-PIPELINE-RUN',
        title: 'Pipeline executed successfully',
        message:
          'All stages completed without errors. Build, test, and deployment passed.',
        severity: 'info',
        location: {
          url: 'https://app.harness.io/org/default/projects/superagi/pipelines/build-test-scan-deploy/runs/123',
          snippet:
            '✅ build (4m14s)\n✅ test (3m25s)\n✅ deploy (2m20s)\nTotal duration: 9m54s',
        },
        aiExplanation:
          'The CI/CD pipeline ran successfully and all required quality gates passed.',
        aiRemediation:
          'No action needed. Continue monitoring future pipeline runs for performance and consistency.',
        raw: {
          pipeline: 'build-test-scan-deploy',
          runId: 'run-123',
          duration: '9m54s',
          stages: [
            { name: 'build', status: 'passed', duration: '2m10s' },
            { name: 'test', status: 'passed', duration: '3m25s' },
            { name: 'deploy', status: 'passed', duration: '2m25s' },
          ],
          result: 'success',
          completedAt: new Date().toISOString(),
        },
      },
    ];

    const vantaFindings: VantaFinding[] = [
      {
        id: 'vanta-001',
        tool: 'vanta',
        ruleId: 'APRA-CPS-234',
        title: 'APRA CPS 234',
        message: '20.7% complete (6/29 controls)',
        severity: 'info',
        aiExplanation:
          'Partial completion of APRA CPS 234 controls. Focus on security governance alignment.',
        aiRemediation:
          '- Implement missing risk management controls\n- Map responsibilities across departments',
      },
      {
        id: 'vanta-002',
        tool: 'vanta',
        ruleId: 'AU-ESSENTIAL-8',
        title: 'Australian Essential 8',
        message: '75% complete (36/48 controls)',
        severity: 'info',
        aiExplanation:
          'Strong progress toward full implementation of Essential 8 maturity model.',
        aiRemediation:
          '- Complete patch management and user application hardening tasks',
      },
      {
        id: 'vanta-003',
        tool: 'vanta',
        ruleId: 'CIS-V8-1',
        title: 'CIS Critical Security Controls v8.1',
        message: '70.8% complete (92/130 controls)',
        severity: 'info',
        aiExplanation:
          'CIS v8.1 controls largely implemented; maintain continuous review.',
        aiRemediation:
          '- Verify asset inventory and continuous vulnerability scanning coverage',
      },
      {
        id: 'vanta-004',
        tool: 'vanta',
        ruleId: 'CMMC-2-0',
        title: 'CMMC 2.0',
        message: '5.1% complete (3/59 controls)',
        severity: 'info',
        aiExplanation: 'Early-stage compliance with CMMC framework.',
        aiRemediation: '- Establish documentation for Level 2 practices',
      },
      {
        id: 'vanta-005',
        tool: 'vanta',
        ruleId: 'DORA',
        title: 'Digital Operational Resilience Act (DORA)',
        message: '31.7% complete (33/104 controls)',
        severity: 'info',
        aiExplanation: 'Moderate implementation of DORA resilience controls.',
        aiRemediation: '- Expand incident response and ICT continuity planning',
      },
      {
        id: 'vanta-006',
        tool: 'vanta',
        ruleId: 'EU-AI-ACT',
        title: 'EU AI ACT',
        message: '5.1% complete (8/157 controls)',
        severity: 'info',
        aiExplanation: 'Minimal progress toward AI Act readiness.',
        aiRemediation:
          '- Begin data governance documentation and model transparency procedures',
      },
      {
        id: 'vanta-007',
        tool: 'vanta',
        ruleId: 'FEDRAMP-5',
        title: 'FedRAMP Rev. 5',
        message: '2.8% complete (9/323 controls)',
        severity: 'info',
        aiExplanation: 'Initial assessment complete; significant work remains.',
        aiRemediation: '- Build SSP and control evidence for FedRAMP baseline',
      },
      {
        id: 'vanta-008',
        tool: 'vanta',
        ruleId: 'GDPR',
        title: 'GDPR',
        message: '54.7% complete (41/75 controls)',
        severity: 'info',
        aiExplanation: 'GDPR compliance at mid-level progress.',
        aiRemediation: '- Finalize data retention and subject access workflows',
      },
      {
        id: 'vanta-009',
        tool: 'vanta',
        ruleId: 'HIPAA',
        title: 'HIPAA',
        message: '9.6% complete (7/73 controls)',
        severity: 'info',
        aiExplanation: 'HIPAA compliance at early maturity.',
        aiRemediation:
          '- Implement PHI encryption and audit trail verification',
      },
      {
        id: 'vanta-010',
        tool: 'vanta',
        ruleId: 'HITRUST',
        title: 'HITRUST',
        message: '70.3% complete (377/536 controls)',
        severity: 'info',
        aiExplanation: 'Substantial HITRUST control coverage achieved.',
        aiRemediation:
          '- Review remaining technical safeguards for alignment with ISO controls',
      },
      {
        id: 'vanta-011',
        tool: 'vanta',
        ruleId: 'ISO-27001',
        title: 'ISO 27001:2022',
        message: '21.8% complete (26/119 controls)',
        severity: 'info',
        aiExplanation: 'Initial ISMS documentation in progress.',
        aiRemediation:
          '- Establish risk treatment plan and internal audit schedule',
      },
      {
        id: 'vanta-012',
        tool: 'vanta',
        ruleId: 'ISO-42001',
        title: 'ISO/IEC 42001:2023',
        message: '42.3% complete (30/71 controls)',
        severity: 'info',
        aiExplanation: 'AI management system partially implemented.',
        aiRemediation:
          '- Define AI accountability structure and training program',
      },
      {
        id: 'vanta-013',
        tool: 'vanta',
        ruleId: 'ISO-9001',
        title: 'ISO/IEC 9001:2015',
        message: '43.1% complete (28/65 controls)',
        severity: 'info',
        aiExplanation:
          'Quality management processes halfway to full certification.',
        aiRemediation:
          '- Complete corrective action and process improvement records',
      },
      {
        id: 'vanta-014',
        tool: 'vanta',
        ruleId: 'NIS-2',
        title: 'NIS 2 Directive',
        message: '36.8% complete (21/57 controls)',
        severity: 'info',
        aiExplanation: 'NIS 2 baseline implemented; risk governance ongoing.',
        aiRemediation:
          '- Document incident notification and supplier risk procedures',
      },
      {
        id: 'vanta-015',
        tool: 'vanta',
        ruleId: 'NIST-800-171',
        title: 'NIST 800-171',
        message: '17.3% complete (19/110 controls)',
        severity: 'info',
        aiExplanation: 'Low adoption of NIST 800-171 safeguards.',
        aiRemediation:
          '- Begin implementing access control and audit logging requirements',
      },
      {
        id: 'vanta-016',
        tool: 'vanta',
        ruleId: 'NIST-800-53',
        title: 'NIST 800-53',
        message: '99.7% complete (369/370 controls)',
        severity: 'info',
        aiExplanation:
          'Nearly full compliance achieved with NIST 800-53 baseline.',
        aiRemediation:
          '- Validate final control evidence for continuous monitoring',
      },
      {
        id: 'vanta-017',
        tool: 'vanta',
        ruleId: 'NIST-AI-RMF',
        title: 'NIST AI Risk Management Framework',
        message: '69.4% complete (50/72 controls)',
        severity: 'info',
        aiExplanation: 'Strong AI governance progress demonstrated.',
        aiRemediation: '- Finalize risk documentation and measurement metrics',
      },
      {
        id: 'vanta-018',
        tool: 'vanta',
        ruleId: 'NIST-CSF-2',
        title: 'NIST CSF 2.0',
        message: '34.9% complete (37/106 controls)',
        severity: 'info',
        aiExplanation: 'Moderate cybersecurity maturity.',
        aiRemediation: '- Expand identify and recover functions coverage',
      },
      {
        id: 'vanta-019',
        tool: 'vanta',
        ruleId: 'PCI-DSS-4',
        title: 'PCI DSS 4.0.1',
        message: '37.6% complete (102/271 controls)',
        severity: 'info',
        aiExplanation: 'Partial PCI DSS implementation.',
        aiRemediation: '- Address multi-factor and encryption control gaps',
      },
      {
        id: 'vanta-020',
        tool: 'vanta',
        ruleId: 'CPS-234-INFOSEC',
        title: 'Prudential Standard CPS 234 Information Security',
        message: '0% complete (0/1 controls)',
        severity: 'info',
        aiExplanation: 'No progress recorded for CPS 234 Information Security.',
        aiRemediation: '- Assign control owner and complete initial assessment',
      },
      {
        id: 'vanta-021',
        tool: 'vanta',
        ruleId: 'SOC-2',
        title: 'SOC 2',
        message: '45.5% complete (35/77 controls)',
        severity: 'info',
        aiExplanation: 'SOC 2 Type 1 readiness halfway achieved.',
        aiRemediation:
          '- Collect system description and trust service criteria evidence',
      },
      {
        id: 'vanta-022',
        tool: 'vanta',
        ruleId: 'SOX-ITGC',
        title: 'SOX IT General Controls',
        message: '48.5% complete (16/33 controls)',
        severity: 'info',
        aiExplanation:
          'SOX ITGC partially met across change management and access controls.',
        aiRemediation:
          '- Ensure segregation of duties and quarterly user reviews',
      },
      {
        id: 'vanta-023',
        tool: 'vanta',
        ruleId: 'TISAX',
        title: 'TISAX',
        message: '7.6% complete (6/79 controls)',
        severity: 'info',
        aiExplanation: 'TISAX compliance just initiated.',
        aiRemediation:
          '- Begin supplier security and data protection assessments',
      },
      {
        id: 'vanta-024',
        tool: 'vanta',
        ruleId: 'US-DATA-PRIVACY',
        title: 'US Data Privacy',
        message: '20.2% complete (19/94 controls)',
        severity: 'info',
        aiExplanation: 'US data privacy frameworks partially implemented.',
        aiRemediation: '- Review CCPA and state-level data handling practices',
      },
    ];

    setInterval(() => {
      // 🌀 your function here
      this.findings.add(harnessFindings);
      console.log(this.findings);
      return;
    }, 32_000);

    setInterval(() => {
      // 🌀 your function here
      this.findings.add(vantaFindings);
      console.log(this.findings);
      return;
    }, 15_000);

    // this.findings.add(mockHarnessFindings);
    // this.findings.add(mockVantaFindings);
  }
}
