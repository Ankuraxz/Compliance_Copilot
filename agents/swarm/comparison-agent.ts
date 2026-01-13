/**
 * Comparison & Decision Agent
 * Phase 5: Compares plan vs findings and decides further actions
 */

import OpenAI from 'openai';
import { AgentMemory } from '@/lib/memory';
// Temperature always set to 1 globally
import { AssessmentPlan } from './planning-agent';
import { AnalysisResult } from './analysis-research-agent';
import { DetailedReport } from './report-agent';
import { CYBERSECURITY_SYSTEM_PROMPTS } from '@/lib/prompts/cybersecurity-prompts';

export interface ComparisonResult {
  planAlignment: {
    objectivesMet: number;
    objectivesTotal: number;
    focusAreasCovered: number;
    focusAreasTotal: number;
    successCriteriaMet: number;
    successCriteriaTotal: number;
  };
  gaps: Array<{
    type: 'missing_coverage' | 'unexpected_finding' | 'insufficient_evidence';
    description: string;
    severity: 'high' | 'medium' | 'low';
    recommendation: string;
  }>;
  nextActions: Array<{
    action: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    rationale: string;
    estimatedEffort: string;
  }>;
  assessmentQuality: {
    score: number; // 0-100
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
}

export class ComparisonAgent {
  private openai: OpenAI;
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.memory = new AgentMemory('comparison-agent', projectId, sessionId);
  }

  /**
   * Compare assessment plan with findings and report
   */
  async compare(
    plan: AssessmentPlan,
    analysis: AnalysisResult,
    report: DetailedReport
  ): Promise<ComparisonResult> {
    // SAFETY: Ensure all required properties exist with defaults
    const safeAnalysis = {
      findings: Array.isArray(analysis?.findings) ? analysis.findings : [],
      insights: Array.isArray(analysis?.insights) ? analysis.insights : [],
      complianceGaps: Array.isArray(analysis?.complianceGaps) ? analysis.complianceGaps : [],
    };
    
    const safeReport = {
      complianceScore: {
        overall: report?.complianceScore?.overall || 0,
      },
      findings: Array.isArray(report?.findings) ? report.findings : [],
      executiveSummary: report?.executiveSummary || 'No summary available',
    };

    const prompt = `Compare the assessment plan with the actual findings and report.

Original Assessment Plan:
${JSON.stringify(plan, null, 2)}

Analysis Results:
- Findings: ${safeAnalysis.findings.length}
- Insights: ${safeAnalysis.insights.length}
- Compliance Gaps: ${safeAnalysis.complianceGaps.length}

Report Summary:
- Overall Score: ${safeReport.complianceScore.overall}/100
- Total Findings: ${safeReport.findings.length}
- Executive Summary: ${safeReport.executiveSummary.substring(0, 500)}

Analyze:
1. How well did the assessment meet the original objectives?
2. Which focus areas were covered vs. planned?
3. Were there unexpected findings not in the plan?
4. Are there gaps in coverage (planned areas not assessed)?
5. What are the next recommended actions?
6. What is the overall quality of this assessment?

Return JSON with this structure:
{
  "planAlignment": {
    "objectivesMet": 2,
    "objectivesTotal": 3,
    "focusAreasCovered": 4,
    "focusAreasTotal": 5,
    "successCriteriaMet": 2,
    "successCriteriaTotal": 3
  },
  "gaps": [
    {
      "type": "missing_coverage",
      "description": "Access Control category was not fully assessed",
      "severity": "high",
      "recommendation": "Re-run extraction with focus on access control mechanisms"
    }
  ],
  "nextActions": [
    {
      "action": "Deep dive into critical findings",
      "priority": "critical",
      "rationale": "3 critical findings require immediate attention",
      "estimatedEffort": "2-4 hours"
    }
  ],
  "assessmentQuality": {
    "score": 85,
    "strengths": ["Comprehensive evidence collection", "Clear recommendations"],
    "weaknesses": ["Some focus areas lacked depth", "Missing documentation evidence"],
    "recommendations": ["Re-assess missing focus areas", "Gather additional documentation"]
  }
}`;

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';

      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: CYBERSECURITY_SYSTEM_PROMPTS.reporting,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const comparison: ComparisonResult = JSON.parse(
        response.choices[0]?.message?.content || '{}'
      );

      // Store comparison in memory
      await this.memory.remember(
        `Comparison completed. Assessment quality: ${comparison.assessmentQuality.score}/100. ${comparison.nextActions.length} next actions identified.`,
        'comparison',
        {
          qualityScore: comparison.assessmentQuality.score,
          nextActionsCount: comparison.nextActions.length,
          gapsCount: comparison.gaps.length,
        }
      );

      return comparison;
    } catch (error: any) {
      console.error('Comparison agent error:', error);
      return this.getDefaultComparison(plan, analysis, report);
    }
  }

  /**
   * Get default comparison if LLM fails
   */
  private getDefaultComparison(
    plan: AssessmentPlan,
    analysis: AnalysisResult,
    report: DetailedReport
  ): ComparisonResult {
    // SAFETY: Ensure all required properties exist with defaults
    const safePlan = {
      objectives: Array.isArray(plan?.objectives) ? plan.objectives : [],
      focusAreas: Array.isArray(plan?.focusAreas) ? plan.focusAreas : [],
      successCriteria: Array.isArray(plan?.successCriteria) ? plan.successCriteria : [],
    };
    
    const safeAnalysis = {
      findings: Array.isArray(analysis?.findings) ? analysis.findings : [],
    };
    
    const safeReport = {
      complianceScore: {
        overall: report?.complianceScore?.overall || 0,
      },
    };

    const objectivesMet = Math.min(
      safePlan.objectives.length,
      Math.floor((safeReport.complianceScore.overall / 100) * safePlan.objectives.length)
    );

    return {
      planAlignment: {
        objectivesMet,
        objectivesTotal: safePlan.objectives.length,
        focusAreasCovered: safeAnalysis.findings.length > 0 ? safePlan.focusAreas.length : 0,
        focusAreasTotal: safePlan.focusAreas.length,
        successCriteriaMet: safeReport.complianceScore.overall > 50 ? safePlan.successCriteria.length : 0,
        successCriteriaTotal: safePlan.successCriteria.length,
      },
      gaps: [],
      nextActions: [
        {
          action: 'Review critical findings',
          priority: 'high',
          rationale: 'Address high-severity compliance gaps',
          estimatedEffort: '1-2 days',
        },
      ],
      assessmentQuality: {
        score: report.complianceScore.overall,
        strengths: ['Comprehensive assessment completed'],
        weaknesses: [],
        recommendations: ['Continue monitoring compliance status'],
      },
    };
  }
}

