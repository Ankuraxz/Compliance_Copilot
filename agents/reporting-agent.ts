/**
 * Reporting Agent
 * Generates compliance assessment reports
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentState, AssessmentReport } from './types';
import { prisma } from '@/lib/db';

export class ReportingAgent {
  /**
   * Create the reporting agent graph
   */
  createGraph() {
    const workflow = new StateGraph<AgentState>({
      channels: {
        projectId: { reducer: (x: string) => x },
        framework: { reducer: (x: string) => x },
        status: { reducer: (x: 'pending' | 'running' | 'completed' | 'failed', y?: 'pending' | 'running' | 'completed' | 'failed') => (y || x) as 'pending' | 'running' | 'completed' | 'failed' },
        currentStep: { reducer: (x: string) => x },
        data: { reducer: (x: any) => x },
        errors: { reducer: (x: string[], y: string[]) => [...(x || []), ...(y || [])] },
        toolCalls: { reducer: (x: any[], y: any[]) => [...(x || []), ...(y || [])] },
      },
    });

    workflow.addNode('calculate_scores', this.calculateScores.bind(this));
    workflow.addNode('generate_summary', this.generateSummary.bind(this));
    workflow.addNode('save_assessment', this.saveAssessment.bind(this));

    // LangGraph type definitions are overly strict - use type assertions
    (workflow as any).addEdge(START, 'calculate_scores');
    (workflow as any).addEdge('calculate_scores', 'generate_summary');
    (workflow as any).addEdge('generate_summary', 'save_assessment');
    (workflow as any).addEdge('save_assessment', END);

    return workflow.compile();
  }

  /**
   * Calculate compliance scores
   */
  private async calculateScores(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Calculating compliance scores...';

      const gaps = state.data.gaps || [];
      const requirements = state.data.requirements || [];
      const framework = state.framework;

      // Calculate overall score
      const totalRequirements = requirements.length;
      const gapsBySeverity = {
        critical: gaps.filter((g) => g.severity === 'critical').length,
        high: gaps.filter((g) => g.severity === 'high').length,
        medium: gaps.filter((g) => g.severity === 'medium').length,
        low: gaps.filter((g) => g.severity === 'low').length,
      };

      // Score calculation: penalize by severity
      const penalty =
        gapsBySeverity.critical * 10 +
        gapsBySeverity.high * 5 +
        gapsBySeverity.medium * 2 +
        gapsBySeverity.low * 1;

      const maxPenalty = totalRequirements * 10;
      const overallScore = Math.max(0, 100 - (penalty / maxPenalty) * 100);

      // Calculate category scores
      const categoryScores: Record<string, number> = {};
      const categories = new Set(requirements.map((r) => r.category));

      for (const category of categories) {
        const categoryRequirements = requirements.filter((r) => r.category === category);
        const categoryGaps = gaps.filter(
          (g) => requirements.find((r) => r.code === g.requirementCode)?.category === category
        );

        const categoryPenalty =
          categoryGaps.filter((g) => g.severity === 'critical').length * 10 +
          categoryGaps.filter((g) => g.severity === 'high').length * 5 +
          categoryGaps.filter((g) => g.severity === 'medium').length * 2 +
          categoryGaps.filter((g) => g.severity === 'low').length * 1;

        const categoryMaxPenalty = categoryRequirements.length * 10;
        categoryScores[category] = Math.max(
          0,
          100 - (categoryPenalty / categoryMaxPenalty) * 100
        );
      }

      const report: AssessmentReport = {
        framework,
        overallScore: Math.round(overallScore * 10) / 10,
        categoryScores,
        totalFindings: gaps.length,
        findingsBySeverity: gapsBySeverity,
        summary: '',
        recommendations: [],
      };

      return {
        data: {
          ...state.data,
          report,
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Score calculation error: ${error.message}`],
      };
    }
  }

  /**
   * Generate summary and recommendations
   */
  private async generateSummary(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Generating assessment summary...';

      const report = state.data.report;
      const gaps = state.data.gaps || [];
      const framework = state.framework;

      // Generate summary
      const summary = report ? this.generateTextSummary(report, gaps, framework) : 'No assessment report available.';

      // Generate recommendations
      const recommendations = report ? this.generateRecommendations(gaps, report) : [];

      return {
        data: {
          ...state.data,
          report: report ? {
            ...report,
            summary,
            recommendations,
          } : {
            framework,
            overallScore: 0,
            categoryScores: {},
            totalFindings: 0,
            findingsBySeverity: {},
            summary,
            recommendations,
          },
        },
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Summary generation error: ${error.message}`],
      };
    }
  }

  /**
   * Save assessment to database
   */
  private async saveAssessment(state: AgentState): Promise<Partial<AgentState>> {
    try {
      state.currentStep = 'Saving assessment...';

      const projectId = state.projectId;
      const framework = state.framework;
      const report = state.data.report;
      const gaps = state.data.gaps || [];
      const remediationPlan = state.data.remediationPlan || [];

      // Get or create framework
      let frameworkRecord = await prisma.complianceFramework.findFirst({
        where: { name: framework },
      });

      if (!frameworkRecord) {
        frameworkRecord = await prisma.complianceFramework.create({
          data: { name: framework },
        });
      }

      // Create assessment
      const assessment = await prisma.complianceAssessment.create({
        data: {
          projectId,
          frameworkId: frameworkRecord.id,
          score: report?.overallScore || 0,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      // Create findings
      for (const gap of gaps) {
        const requirement = await prisma.complianceRequirement.findFirst({
          where: {
            frameworkId: frameworkRecord.id,
            code: gap.requirementCode,
          },
        });

        const finding = await prisma.finding.create({
          data: {
            projectId,
            assessmentId: assessment.id,
            requirementId: requirement?.id,
            severity: gap.severity,
            title: gap.title,
            description: gap.description,
            status: 'open',
          },
        });

        // Create evidence
        for (const evidence of gap.evidence) {
          await prisma.evidence.create({
            data: {
              findingId: finding.id,
              type: evidence.type,
              source: evidence.source,
              filePath: evidence.filePath,
              lineNumber: evidence.lineNumber,
              content: evidence.content,
              url: evidence.url,
            },
          });
        }

        // Create remediation task
        const task = remediationPlan.find((t) => t.findingId === gap.id);
        if (task) {
          await prisma.remediationTask.create({
            data: {
              findingId: finding.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              status: 'pending',
            },
          });
        }
      }

      state.status = 'completed';

      return {
        status: 'completed',
        currentStep: 'Assessment saved successfully',
      };
    } catch (error: any) {
      return {
        errors: [...state.errors, `Save error: ${error.message}`],
        status: 'failed',
      };
    }
  }

  private generateTextSummary(
    report: AssessmentReport,
    gaps: any[],
    framework: string
  ): string {
    const score = report.overallScore;
    const totalGaps = gaps.length;
    const criticalGaps = gaps.filter((g) => g.severity === 'critical').length;

    let summary = `Compliance Assessment for ${framework}\n\n`;
    summary += `Overall Score: ${score.toFixed(1)}/100\n\n`;
    summary += `Total Findings: ${totalGaps}\n`;
    summary += `- Critical: ${report.findingsBySeverity.critical}\n`;
    summary += `- High: ${report.findingsBySeverity.high}\n`;
    summary += `- Medium: ${report.findingsBySeverity.medium}\n`;
    summary += `- Low: ${report.findingsBySeverity.low}\n\n`;

    if (score >= 80) {
      summary += `Status: Good compliance posture. Minor improvements recommended.`;
    } else if (score >= 60) {
      summary += `Status: Moderate compliance. Several areas need attention.`;
    } else if (score >= 40) {
      summary += `Status: Significant gaps identified. Immediate action required.`;
    } else {
      summary += `Status: Critical compliance issues. Urgent remediation needed.`;
    }

    if (criticalGaps > 0) {
      summary += `\n\n⚠️ ${criticalGaps} critical finding(s) require immediate attention.`;
    }

    return summary;
  }

  private generateRecommendations(gaps: any[], report: AssessmentReport): string[] {
    const recommendations: string[] = [];

    if (report.findingsBySeverity.critical > 0) {
      recommendations.push(
        `Address ${report.findingsBySeverity.critical} critical finding(s) immediately to prevent compliance violations.`
      );
    }

    if (report.findingsBySeverity.high > 0) {
      recommendations.push(
        `Prioritize remediation of ${report.findingsBySeverity.high} high-severity finding(s) within 30 days.`
      );
    }

    // Category-specific recommendations
    const lowCategories = Object.entries(report.categoryScores)
      .filter(([_, score]) => score < 60)
      .map(([category]) => category);

    if (lowCategories.length > 0) {
      recommendations.push(
        `Focus on improving compliance in: ${lowCategories.join(', ')}`
      );
    }

    recommendations.push(
      `Establish continuous monitoring and regular compliance assessments.`
    );

    return recommendations;
  }
}

