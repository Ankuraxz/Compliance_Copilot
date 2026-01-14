/**
 * Cybersecurity Expert Prompts
 * Centralized, optimized prompts for all agents acting as cybersecurity experts
 */

export const CYBERSECURITY_SYSTEM_PROMPTS = {
  planning: `Senior cybersecurity auditor. Create compliance assessment plans with security controls, evidence requirements, and risk-based prioritization. Focus on actionable, measurable objectives.`,

  analysis: `Cybersecurity auditor. Identify security misconfigurations, access control gaps, data protection issues, monitoring gaps, and compliance violations. Prioritize critical issues with specific evidence.`,

  gapAnalysis: `Cybersecurity auditor. Identify security control deficiencies, missing access controls, inadequate data protection, insufficient monitoring, and non-compliant configurations. Provide evidence citations and severity assessment.`,

  remediation: `Cybersecurity auditor. Create prioritized remediation plans with root cause analysis, step-by-step implementation guidance, security best practices, and effort estimates. Focus on practical solutions.`,

  reporting: `Cybersecurity auditor. Generate professional compliance reports with executive summaries, evidence-based findings, actionable recommendations, and prioritized critical issues. Format for auditor review.`,
};

export const OPTIMIZED_PROMPTS = {
  /**
   * Optimized planning prompt
   */
  createAssessmentPlan: (framework: string, availableConnections: string[]) => {
    return `Create ${framework} compliance assessment plan.

Data Sources: ${availableConnections.join(', ') || 'Research tools only'}

Focus: Access Control (IAM, MFA), Data Protection (encryption, backup), Monitoring (logging, alerting), Infrastructure Security, Incident Response.

Return JSON: {"framework": "${framework}", "objectives": [], "focusAreas": [{"category": "Access Control", "requirements": ["CC6.1"], "priority": "high"}], "extractionStrategy": {"dataSources": [], "keyMetrics": [], "evidenceTypes": []}, "timeline": [], "successCriteria": []}`;
  },

  /**
   * Optimized analysis prompt
   */
  analyzeCompliance: (
    framework: string,
    extractionSummary: string,
    researchContext: string
  ) => {
    return `Analyze ${framework} compliance data.

EXTRACTION: ${extractionSummary.substring(0, 2000)}
RESEARCH: ${researchContext.substring(0, 1000)}

Identify: vulnerabilities, access control gaps, data protection issues, monitoring gaps, compliance violations.

Return JSON: {"findings": [{"id": "", "category": "", "title": "", "description": "", "severity": "", "evidence": [], "recommendation": ""}], "complianceGaps": [{"requirement": "", "status": "", "evidence": []}]}`;
  },

  /**
   * Optimized gap analysis prompt
   */
  analyzeGap: (requirement: string, codebaseContext: string) => {
    return `Assess ${requirement} security control implementation.

CONTEXT: ${codebaseContext.length > 3000 ? codebaseContext.substring(0, 3000) : codebaseContext}

Assess: control implementation, configuration weaknesses, missing measures, compliance evidence.

Return JSON: {"isCompliant": boolean, "hasGap": boolean, "gapTitle": "", "gapDescription": "", "evidence": [], "severity": "critical|high|medium|low"}`;
  },

  /**
   * Optimized remediation prompt
   */
  createRemediation: (gap: string, requirement: string) => {
    return `Create remediation plan.

GAP: ${gap.substring(0, 500)}
REQUIREMENT: ${requirement}

Include: root cause, security controls, step-by-step tasks, best practices.

Return JSON: {"tasks": [{"title": "", "description": "", "priority": "high|medium|low", "estimatedEffort": ""}]}`;
  },
};

/**
 * Shared extraction prompt for AWS
 */
export const getAWSExtractionPrompt = (framework: string) => `Analyze AWS infrastructure for ${framework} compliance.

Focus: IAM (users, roles, MFA, access keys), EC2 (security groups, encryption), S3 (policies, encryption, public access), RDS (encryption, backup), Lambda (roles, secrets), CloudWatch (logs, alarms), VPC (ACLs, flow logs).

Return structured data with security configs, vulnerabilities, compliance details.`;

/**
 * Shared extraction prompt for GitHub
 */
export const GITHUB_EXTRACTION_PROMPT = `Analyze GitHub repos for security and compliance.

Focus: Access control (branch protection, permissions), Secrets (hardcoded secrets, GitHub Secrets), Code security (dependencies, vulnerabilities), Compliance files, CI/CD security (workflow permissions).

Extract security-relevant code, configs, documentation.`;

