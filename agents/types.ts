/**
 * Agent Types and Interfaces
 */

export interface AgentState {
  projectId: string;
  framework: string; // SOC2, GDPR, HIPAA
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: string;
  data: {
    codebase?: CodebaseData;
    requirements?: ComplianceRequirement[];
    gaps?: GapFinding[];
    remediationPlan?: RemediationTask[];
    report?: AssessmentReport;
  };
  errors: string[];
  toolCalls: ToolCall[];
}

export interface CodebaseData {
  files: Array<{
    path: string;
    content: string;
    language: string;
    lines: number;
  }>;
  infrastructure: Array<{
    type: string;
    config: any;
    source: string;
  }>;
  documentation: Array<{
    title: string;
    content: string;
    source: string;
  }>;
}

export interface ComplianceRequirement {
  code: string;
  title: string;
  description: string;
  category: string;
  framework: string;
  relevance: number; // 0-1
}

export interface GapFinding {
  id: string;
  requirementCode: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  evidence: Evidence[];
  recommendation: string;
}

export interface Evidence {
  type: 'code' | 'documentation' | 'config' | 'log';
  source: string;
  filePath?: string;
  lineNumber?: number;
  content: string;
  url?: string;
}

export interface RemediationTask {
  findingId: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  steps: string[];
  estimatedEffort: string;
  externalTicketId?: string;
  externalTicketUrl?: string;
}

export interface AssessmentReport {
  framework: string;
  overallScore: number; // 0-100
  categoryScores: Record<string, number>;
  totalFindings: number;
  findingsBySeverity: Record<string, number>;
  summary: string;
  recommendations: string[];
}

export interface ToolCall {
  id: string;
  agent: string;
  tool: string;
  parameters: any;
  result?: any;
  status: 'pending' | 'success' | 'error';
  timestamp: Date;
  error?: string;
}

