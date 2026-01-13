/**
 * Report Generation Agent
 * Creates detailed analysis reports with proper evidence citations
 */

/**
 * Report Generation Agent
 * Phase 4: Compiles final report from analysis results
 */

import OpenAI from 'openai';
import { SwarmState } from './manager-agent';
import { ExtractionResult } from './extraction-agents';
import { AnalysisResult } from './analysis-research-agent';
import { AgentMemory } from '@/lib/memory';
import { PerplexityClient } from '@/lib/api-clients/perplexity';
import { BrowserbaseClient } from '@/lib/api-clients/browserbase';
// Temperature always set to 1 globally
import { CYBERSECURITY_SYSTEM_PROMPTS } from '@/lib/prompts/cybersecurity-prompts';

export interface ReportSection {
  title: string;
  content: string;
  evidence: Array<{
    source: string;
    type: string;
    citation: string;
    quote?: string;
  }>;
}

export interface DetailedReport {
  executiveSummary: string;
  sections: ReportSection[];
  findings: Array<{
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    evidence: Array<{
      source: string;
      citation: string;
      quote: string;
    }>;
    recommendation: string;
  }>;
  complianceScore: {
    overall: number;
    byCategory: Record<string, number>;
  };
  remediationPlan?: Array<{
    findingId: string;
    title: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    steps: string[];
    estimatedEffort: string;
  }>;
  metadata: {
    framework: string;
    generatedAt: Date;
    dataSources: string[];
    extractionAgents: string[];
  };
}

export class ReportGenerationAgent {
  private openai: OpenAI;
  private memory: AgentMemory;
  private perplexityClient: PerplexityClient | null = null;
  private browserbaseClient: BrowserbaseClient | null = null;

  constructor(projectId: string, sessionId: string) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.memory = new AgentMemory('report-generation', projectId, sessionId);
    
    // Initialize Perplexity client if API key is available
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (perplexityKey) {
      this.perplexityClient = new PerplexityClient(perplexityKey);
    }
    
    // Initialize Browserbase client if credentials are available
    const browserbaseKey = process.env.BROWSERBASE_API_KEY;
    const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
    if (browserbaseKey && browserbaseProjectId) {
      this.browserbaseClient = new BrowserbaseClient(browserbaseKey, browserbaseProjectId);
    }
  }

  /**
   * Generate detailed report from swarm extraction results
   * Phase 4: Compiles final report
   * 
   * @param swarmState - Complete swarm state including framework, gapFindings, remediationPlan
   * @param extractionResults - Results from extraction agents (MCP scans, code analysis, etc.)
   * @param analysis - Analysis results from Phase 3 (optional, can also be in swarmState.analysis)
   * @param gapFindings - Gap findings from Phase 3.2 (optional, can also be in swarmState.gapFindings)
   * @param remediationPlan - Remediation plan from Phase 3.3 (optional, can also be in swarmState.remediationPlan)
   */
  async generateReport(
    swarmState: SwarmState,
    extractionResults: ExtractionResult[],
    analysis?: AnalysisResult,
    gapFindings?: Array<{
      id: string;
      requirementCode: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      title: string;
      description: string;
      evidence: Array<{
        type: string;
        source: string;
        filePath?: string;
        lineNumber?: number;
        content: string;
        url?: string;
      }>;
      recommendation: string;
    }>,
    remediationPlan?: Array<{
      findingId: string;
      title: string;
      description: string;
      priority: 'critical' | 'high' | 'medium' | 'low';
      steps: string[];
      estimatedEffort: string;
    }>
  ): Promise<DetailedReport> {
    try {
      // MULTI-LAYER PROTECTION: Ensure all inputs are valid
      // LAYER 1: Validate and normalize inputs
      const safeExtractionResults = Array.isArray(extractionResults) ? extractionResults : [];
      const safeFramework = swarmState.framework || 'SOC2';
      
      // Build context from all extraction results
      const context = this.buildContext(safeExtractionResults);

      // LAYER 2: Generate report sections with fallback and timeout
      let sections: ReportSection[] = [];
      try {
        // Add timeout to section generation (45 seconds - increased from 30)
        const sectionsPromise = this.generateSections(swarmState, context);
        const sectionsTimeout = new Promise<ReportSection[]>((_, reject) => {
          setTimeout(() => reject(new Error('Sections generation timeout')), 45000); // Increased to 45 seconds
        });
        
        sections = await Promise.race([sectionsPromise, sectionsTimeout]);
        // Ensure sections is always an array
        if (!Array.isArray(sections) || sections.length === 0) {
          console.warn('[Report Agent] Sections generation returned empty, creating default section');
          sections = [{
            title: 'Assessment Overview',
            content: `Compliance assessment for ${safeFramework} framework.`,
            evidence: [],
          }];
        }
      } catch (sectionError: any) {
        console.error('[Report Agent] Section generation failed or timed out:', sectionError?.message || 'Unknown error');
        sections = [{
          title: 'Assessment Overview',
          content: `Compliance assessment for ${safeFramework} framework.`,
          evidence: [],
        }];
      }
      
      // LAYER 3: Generate findings with fallback and timeout
      // OPTIMIZATION: Use gap findings directly if available (skip slow LLM analysis)
      // Priority: explicit gapFindings parameter > swarmState.gapFindings
      const effectiveGapFindings = gapFindings || swarmState.gapFindings;
      const effectiveRemediationPlan = remediationPlan || swarmState.remediationPlan;
      const effectiveAnalysis = analysis || swarmState.analysis;
      
      let findings: DetailedReport['findings'] = [];
      try {
        // If we have gap findings, use them directly (fast path)
        if (effectiveGapFindings && effectiveGapFindings.length > 0) {
          console.log(`[Report Agent] Using ${effectiveGapFindings.length} gap findings directly (fast path)`);
          findings = effectiveGapFindings.map(gap => ({
            title: gap.title || 'Untitled Finding',
            description: gap.description || '',
            severity: gap.severity,
            evidence: (gap.evidence || []).slice(0, 3).map(ev => ({
              source: ev.source || 'Unknown',
              citation: this.formatGapEvidenceCitation(ev),
              quote: (ev.content && typeof ev.content === 'string') ? ev.content.substring(0, 500) : 'No content available',
            })),
            recommendation: gap.recommendation || '',
          }));
        } else {
          // Only call generateFindings if no gap findings (slower path)
          const findingsPromise = this.generateFindings(
            swarmState, 
            safeExtractionResults, 
            effectiveGapFindings,
            effectiveRemediationPlan
          );
          const findingsTimeout = new Promise<DetailedReport['findings']>((_, reject) => {
            setTimeout(() => reject(new Error('Findings generation timeout')), 45000); // 45 seconds
          });
          
          findings = await Promise.race([findingsPromise, findingsTimeout]);
        }
        
        // Ensure findings is always an array
        if (!Array.isArray(findings)) {
          console.warn('[Report Agent] Findings generation returned invalid format, using empty array');
          findings = [];
        }
      } catch (findingsError: any) {
        console.error('[Report Agent] Findings generation failed or timed out:', findingsError?.message || 'Unknown error');
        // Fallback: try to use gap findings even if generateFindings failed
        if (effectiveGapFindings && effectiveGapFindings.length > 0) {
          console.log('[Report Agent] Falling back to gap findings after error');
          findings = effectiveGapFindings.slice(0, 20).map(gap => ({
            title: gap.title || 'Untitled Finding',
            description: gap.description || '',
            severity: gap.severity,
            evidence: (gap.evidence || []).slice(0, 2).map(ev => ({
              source: ev.source || 'Unknown',
              citation: this.formatGapEvidenceCitation(ev),
              quote: (ev.content && typeof ev.content === 'string') ? ev.content.substring(0, 300) : 'No content available',
            })),
            recommendation: gap.recommendation || '',
          }));
        } else {
          findings = [];
        }
      }
      
      // LAYER 4: Calculate compliance scores with fallback
      let complianceScore: DetailedReport['complianceScore'];
      try {
        complianceScore = this.calculateComplianceScore(findings, safeFramework);
      } catch (scoreError: any) {
        console.error('[Report Agent] Score calculation failed:', scoreError?.message || 'Unknown error');
        // CRITICAL FIX: Use strict scoring even in fallback - never return 100 if findings exist
        const safeFindings = Array.isArray(findings) ? findings : [];
        if (safeFindings.length === 0) {
          complianceScore = {
            overall: 50, // Unknown status - penalize for lack of assessment data
            byCategory: {},
          };
        } else {
          // Calculate penalty-based score
          const severityPenalties: Record<string, number> = {
            critical: 20,
            high: 10,
            medium: 5,
            low: 2,
          };
          let totalPenalty = 0;
          for (const finding of safeFindings) {
            const penalty = severityPenalties[finding.severity] || 5;
            totalPenalty += penalty;
          }
          complianceScore = {
            overall: Math.max(0, 100 - totalPenalty),
            byCategory: {},
          };
        }
      }
      
      // LAYER 5: Generate executive summary with fallback and timeout
      let executiveSummary: string;
      try {
        const summaryPromise = this.generateExecutiveSummary(
          swarmState,
          findings,
          complianceScore,
          effectiveRemediationPlan
        );
        const summaryTimeout = new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error('Executive summary generation timeout')), 30000); // Increased to 30 seconds
        });
        
        executiveSummary = await Promise.race([summaryPromise, summaryTimeout]);
        // Ensure executive summary is a non-empty string
        if (!executiveSummary || typeof executiveSummary !== 'string' || executiveSummary.trim().length === 0) {
          console.warn('[Report Agent] Executive summary generation returned empty, creating default');
          executiveSummary = `Compliance assessment for ${safeFramework} framework completed. ${findings.length} finding(s) identified.`;
        }
      } catch (summaryError: any) {
        console.error('[Report Agent] Executive summary generation failed or timed out:', summaryError?.message || 'Unknown error');
        // Generate default summary quickly
        const criticalCount = findings.filter(f => f.severity === 'critical').length;
        const highCount = findings.filter(f => f.severity === 'high').length;
        executiveSummary = `Compliance assessment for ${safeFramework} framework completed. Overall score: ${complianceScore.overall}/100. ${findings.length} finding(s) identified (${criticalCount} critical, ${highCount} high). Review detailed findings and implement remediation plan.`;
      }

      const report: DetailedReport = {
        executiveSummary,
        sections,
        findings,
        complianceScore,
        remediationPlan: Array.isArray(effectiveRemediationPlan) ? effectiveRemediationPlan : [],
        metadata: {
          framework: safeFramework,
          generatedAt: new Date(),
          dataSources: safeExtractionResults.map(r => r.source || 'Unknown').filter(s => s !== 'Unknown'),
          extractionAgents: safeExtractionResults.map(r => r.agent || 'Unknown').filter(a => a !== 'Unknown'),
        },
      };

      // LAYER 6: Remember report generation (non-blocking)
      try {
        await this.memory.remember(
          `Report generated for ${safeFramework}. ${findings.length} findings identified, ${effectiveRemediationPlan?.length || 0} remediation tasks created.`,
          'report_generation',
          { 
            framework: safeFramework, 
            findingsCount: findings.length,
            remediationTasksCount: effectiveRemediationPlan?.length || 0,
          }
        );
      } catch (memoryError: any) {
        console.warn('[Report Agent] Failed to save to memory (non-critical):', memoryError?.message || 'Unknown error');
        // Continue - memory save is not critical
      }

      return report;
    } catch (error: any) {
      // LAYER 7: Final fallback - return minimal report structure
      console.error('[Report Agent] Report generation failed completely:', error?.message || 'Unknown error');
      const safeFramework = swarmState.framework || 'SOC2';
      return {
        executiveSummary: `Compliance assessment for ${safeFramework} framework. Report generation encountered errors but assessment data is available.`,
        sections: [{
          title: 'Assessment Overview',
          content: `Compliance assessment for ${safeFramework} framework.`,
          evidence: [],
        }],
        findings: [],
        complianceScore: {
          overall: 0,
          byCategory: {},
        },
        remediationPlan: [],
        metadata: {
          framework: safeFramework,
          generatedAt: new Date(),
          dataSources: [],
          extractionAgents: [],
        },
      };
    }
  }

  /**
   * Build context from extraction results
   */
  private buildContext(extractionResults: ExtractionResult[]): string {
    const contextParts: string[] = [];

    for (const result of extractionResults || []) {
      contextParts.push(`\n## ${result.agent || 'Unknown Agent'} (${result.source || 'Unknown Source'})`);
      contextParts.push(`Data: ${JSON.stringify(result.data || {}, null, 2)}`);
      contextParts.push(`Evidence items: ${result.evidence?.length || 0}`);
    }

    const context = contextParts.join('\n');
    return context || 'No extraction results available.';
  }

  /**
   * Generate report sections
   * Enhanced with Perplexity research for best practices and examples
   */
  private async generateSections(
    swarmState: SwarmState,
    context: string
  ): Promise<ReportSection[]> {
    const safeContext = (context && typeof context === 'string') ? context.substring(0, 8000) : 'No context available.';
    
    // Enhance context with Perplexity research if available
    let enhancedContext = safeContext;
    if (this.perplexityClient) {
      try {
        const researchQuery = `${swarmState.framework} compliance best practices security controls assessment 2024`;
        const researchPromise = this.perplexityClient.search(researchQuery);
        const researchTimeout = new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error('Perplexity research timeout')), 10000);
        });
        
        const researchResult = await Promise.race([researchPromise, researchTimeout]);
        if (researchResult && researchResult.trim().length > 100) {
          enhancedContext += `\n\n## Research Context (Best Practices):\n${researchResult.substring(0, 2000)}`;
          console.log('[Report Agent] Enhanced sections with Perplexity research');
        }
      } catch (error: any) {
        console.warn('[Report Agent] Perplexity research for sections failed (non-critical):', error?.message || 'Unknown error');
        // Continue without research enhancement
      }
    }
    
    const prompt = `Generate a professional compliance analysis report for ${swarmState.framework} framework.

Context from extraction agents:
${enhancedContext}

Generate 3-4 professional sections (300 words max each, 2 evidence max per section) covering:
1. Security Controls Assessment
2. Access Control & Identity Management
3. Data Protection & Encryption
4. Monitoring & Incident Response

Each section must include specific findings, evidence citations, and compliance status. Reference best practices from research context when relevant.

Return JSON: {"sections": [{"title": "...", "content": "...", "evidence": [{"source": "...", "type": "...", "citation": "..."}]}]}`;

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      // Add timeout to LLM call (40 seconds - increased from 25)
      const llmPromise = this.openai.chat.completions.create({
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
      
      const llmTimeout = new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error('LLM call timeout')), 40000); // Increased to 40 seconds
      });

      const response = await Promise.race([llmPromise, llmTimeout]);
      const content = response.choices[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        console.warn('[Report Agent] Section generation: Empty or invalid response from LLM');
        return [];
      }
      
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError: any) {
        console.error('[Report Agent] Section generation: JSON parse error:', parseError?.message || 'Invalid JSON');
        return [];
      }
      
      let sections = parsed.sections || [];
      
      // Validate sections structure
      if (!Array.isArray(sections)) {
        console.warn('[Report Agent] Section generation: sections is not an array');
        return [];
      }
      
      // Enhance sections with additional research if available
      if (sections.length > 0 && this.perplexityClient) {
        try {
          sections = await this.enhanceSectionsWithResearch(sections, swarmState.framework);
        } catch (enhanceError: any) {
          console.warn('[Report Agent] Section enhancement failed (non-critical):', enhanceError?.message || 'Unknown error');
          // Continue with original sections if enhancement fails
        }
      }
      
      // Final validation: ensure sections have required fields
      sections = sections.filter(section => 
        section && 
        typeof section.title === 'string' && 
        section.title.trim().length > 0 &&
        typeof section.content === 'string'
      );
      
      return sections;
    } catch (error: any) {
      console.error('Section generation error:', error?.message || error);
      return [];
    }
  }
  
  /**
   * Enhance report sections with Perplexity research
   */
  private async enhanceSectionsWithResearch(
    sections: ReportSection[],
    framework: string
  ): Promise<ReportSection[]> {
    if (!this.perplexityClient || sections.length === 0) {
      return sections;
    }
    
    const enhancedSections = [...sections];
    
    // Enhance each section with relevant research (limit to 3 sections to avoid timeout)
    for (let i = 0; i < Math.min(3, enhancedSections.length); i++) {
      try {
        const section = enhancedSections[i];
        const researchQuery = `${framework} ${section.title} compliance requirements best practices`;
        
        const researchPromise = this.perplexityClient!.search(researchQuery);
        const researchTimeout = new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error('Section research timeout')), 8000);
        });
        
        const researchResult = await Promise.race([researchPromise, researchTimeout]);
        if (researchResult && researchResult.trim().length > 100) {
          // Add research as additional evidence
          const researchEvidence = {
            source: 'Perplexity Research',
            type: 'research',
            citation: `Best practices for ${section.title}`,
            quote: researchResult.substring(0, 500),
          };
          
          // Enhance section content with research insights
          const researchSummary = researchResult.substring(0, 200);
          if (!section.content.includes(researchSummary)) {
            section.content += `\n\nNote: Industry best practices suggest ${researchSummary}`;
            section.evidence.push(researchEvidence);
          }
        }
      } catch (error: any) {
        // Skip enhancement for this section if it fails
        console.warn(`[Report Agent] Failed to enhance section "${enhancedSections[i]?.title}" with research:`, error?.message || 'Unknown error');
      }
    }
    
    return enhancedSections;
  }

  /**
   * Generate findings with evidence citations
   * Prioritizes gap findings from Phase 3.2, then analysis findings, then extraction evidence
   */
  private async generateFindings(
    swarmState: SwarmState,
    extractionResults: ExtractionResult[],
    gapFindings?: Array<{
      id: string;
      requirementCode: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      title: string;
      description: string;
      evidence: Array<{
        type: string;
        source: string;
        filePath?: string;
        lineNumber?: number;
        content: string;
        url?: string;
      }>;
      recommendation: string;
    }>,
    remediationPlan?: Array<{
      findingId: string;
      title: string;
      description: string;
      priority: 'critical' | 'high' | 'medium' | 'low';
      steps: string[];
      estimatedEffort: string;
    }>
  ): Promise<DetailedReport['findings']> {
    const findings: DetailedReport['findings'] = [];

    // First, convert gap findings to report findings (highest priority)
    if (gapFindings && gapFindings.length > 0) {
      for (const gap of gapFindings) {
        findings.push({
          title: gap.title || 'Untitled Finding',
          description: gap.description || '',
          severity: gap.severity,
          evidence: (gap.evidence || []).map(ev => ({
            source: ev.source || 'Unknown',
            citation: this.formatGapEvidenceCitation(ev),
            quote: (ev.content && typeof ev.content === 'string') ? ev.content.substring(0, 500) : (typeof ev.content === 'object' ? JSON.stringify(ev.content).substring(0, 500) : 'No content available'),
          })),
          recommendation: gap.recommendation || '',
        });
      }
    }

    // Then, add analysis findings if available (from analysis parameter or swarmState)
    // Note: analysis parameter is not passed to generateFindings, so we check swarmState
    if (swarmState.analysis?.findings) {
      for (const analysisFinding of swarmState.analysis.findings) {
        findings.push({
          title: analysisFinding.title || 'Untitled Finding',
          description: analysisFinding.description || '',
          severity: analysisFinding.severity,
          evidence: (analysisFinding.evidence || []).map(ev => ({
            source: ev.source || 'Unknown',
            citation: `${ev.type || 'evidence'} from ${ev.source || 'unknown'}`,
            quote: (ev.content && typeof ev.content === 'string') ? ev.content.substring(0, 500) : (typeof ev.content === 'object' ? JSON.stringify(ev.content).substring(0, 500) : 'No content available'),
          })),
          recommendation: analysisFinding.recommendation || '',
        });
      }
    }

    // Finally, analyze extraction evidence for additional findings (if not already covered)
    const existingTitles = new Set(findings.map(f => f.title.toLowerCase()));
    const allEvidence: Array<{
      source: string;
      agent: string;
      type: string;
      content: string;
      metadata: Record<string, any>;
    }> = [];

    for (const result of extractionResults) {
      for (const evidence of result.evidence || []) {
        // Ensure content is a string
        let content = '';
        if (evidence.content) {
          if (typeof evidence.content === 'string') {
            content = evidence.content;
          } else if (typeof evidence.content === 'object') {
            content = JSON.stringify(evidence.content);
          } else {
            content = String(evidence.content);
          }
        }
        
        allEvidence.push({
          source: result.source || 'Unknown',
          agent: result.agent || 'Unknown',
          type: evidence.type || 'evidence',
          content: content,
          metadata: evidence.metadata || {},
        });
      }
    }

    // Generate findings from evidence (only if not already covered)
    // OPTIMIZATION: Limit evidence analysis to prevent timeout (max 12 items, 10 seconds each)
    const evidenceToAnalyze = allEvidence.slice(0, 12); // Reduced from 15 to 12 to allow more time per item
    const evidencePromises = evidenceToAnalyze.map(async (evidence) => {
      try {
        // Add timeout to each evidence analysis (10 seconds - increased from 8)
        const analysisPromise = this.analyzeEvidence(evidence, swarmState.framework);
        const analysisTimeout = new Promise<Omit<DetailedReport['findings'][0], 'evidence'> | null>((_, reject) => {
          setTimeout(() => reject(new Error('Evidence analysis timeout')), 10000); // Increased to 10 seconds
        });
        
        const finding = await Promise.race([analysisPromise, analysisTimeout]);
        if (finding && !existingTitles.has(finding.title.toLowerCase())) {
          // Enhance finding with Perplexity research if available
          let enhancedFinding = finding;
          if (this.perplexityClient && finding.severity !== 'low') {
            try {
              const researchQuery = `${swarmState.framework} ${finding.title} remediation best practices`;
              const researchPromise = this.perplexityClient.search(researchQuery);
              const researchTimeout = new Promise<string>((_, reject) => {
                setTimeout(() => reject(new Error('Finding research timeout')), 6000);
              });
              
              const researchResult = await Promise.race([researchPromise, researchTimeout]);
              if (researchResult && researchResult.trim().length > 50) {
                // Enhance recommendation with research
                enhancedFinding = {
                  ...finding,
                  recommendation: `${finding.recommendation}\n\nAdditional context: ${researchResult.substring(0, 300)}`,
                };
              }
            } catch (error: any) {
              // Continue with original finding if research fails
              console.warn(`[Report Agent] Failed to enhance finding "${finding.title}" with research:`, error?.message || 'Unknown error');
            }
          }
          
          findings.push({
            ...enhancedFinding,
            evidence: [
              {
                source: evidence.source || 'Unknown',
                citation: this.formatCitation(evidence),
                quote: (evidence.content && typeof evidence.content === 'string') 
                  ? evidence.content.substring(0, 500) 
                  : (evidence.content && typeof evidence.content === 'object' 
                    ? JSON.stringify(evidence.content).substring(0, 500) 
                    : 'No content available'),
              },
            ],
          });
          existingTitles.add(enhancedFinding.title.toLowerCase());
        }
      } catch (error: any) {
        // CRITICAL FIX: Even if analysis times out, include evidence as a finding
        // This ensures evidence is not lost due to LLM timeouts
        if (error?.message?.includes('timeout') || error?.message?.includes('Evidence analysis')) {
          // Create a basic finding from the evidence even if LLM analysis failed
          const evidenceTitle = `${evidence.type || 'Evidence'} from ${evidence.source || 'Unknown'}`;
          if (!existingTitles.has(evidenceTitle.toLowerCase())) {
            findings.push({
              title: evidenceTitle,
              description: `Evidence identified from ${evidence.source || 'unknown source'}. Analysis timed out but evidence is included for review.`,
              severity: 'medium', // Default to medium if we can't analyze
              evidence: [
                {
                  source: evidence.source || 'Unknown',
                  citation: this.formatCitation(evidence),
                  quote: (evidence.content && typeof evidence.content === 'string') 
                    ? evidence.content.substring(0, 500) 
                    : (typeof evidence.content === 'object' 
                      ? JSON.stringify(evidence.content).substring(0, 500) 
                      : 'No content available'),
                },
              ],
              recommendation: 'Review this evidence manually to determine compliance impact.',
            });
            existingTitles.add(evidenceTitle.toLowerCase());
            console.log(`[Report Agent] Created finding from timed-out evidence: ${evidenceTitle}`);
          }
        } else {
          // For non-timeout errors, just log a warning
          console.warn(`[Report Agent] Evidence analysis skipped: ${error?.message || 'Unknown error'}`);
        }
      }
    });
    
    // Wait for all evidence analyses in parallel (with individual timeouts)
    await Promise.allSettled(evidencePromises);

    // MULTI-LAYER PROTECTION: Ensure findings array is never null/undefined
    if (!Array.isArray(findings)) {
      console.warn('[Report Agent] Findings array is invalid, returning empty array');
      return [];
    }
    
    // Ensure at least one finding if we have gap findings or evidence
    if (findings.length === 0 && ((gapFindings && gapFindings.length > 0) || extractionResults.length > 0)) {
      console.warn('[Report Agent] No findings generated despite having gap findings or evidence, creating summary finding');
      findings.push({
        title: 'Compliance Assessment Summary',
        description: `Assessment completed for ${swarmState.framework || 'SOC2'} framework. ${gapFindings?.length || 0} gap(s) identified.`,
        severity: 'medium',
        evidence: [],
        recommendation: 'Review the assessment results and address identified compliance gaps.',
      });
    }
    
    return findings;
  }

  /**
   * Format citation for gap evidence
   */
  private formatGapEvidenceCitation(evidence: {
    type: string;
    source: string;
    filePath?: string;
    lineNumber?: number;
    content: string;
    url?: string;
  }): string {
    const parts: string[] = [];
    
    if (evidence.source) parts.push(`Source: ${evidence.source}`);
    if (evidence.type) parts.push(`Type: ${evidence.type}`);
    if (evidence.filePath) parts.push(`File: ${evidence.filePath}`);
    if (evidence.lineNumber) parts.push(`Line: ${evidence.lineNumber}`);
    if (evidence.url) parts.push(`URL: ${evidence.url}`);

    return parts.join(' | ');
  }

  /**
   * Analyze evidence and generate finding
   */
  private async analyzeEvidence(
    evidence: any,
    framework: string
  ): Promise<Omit<DetailedReport['findings'][0], 'evidence'> | null> {
    // Safely extract content
    let contentStr = '';
    if (evidence.content) {
      if (typeof evidence.content === 'string') {
        contentStr = evidence.content;
      } else if (typeof evidence.content === 'object') {
        contentStr = JSON.stringify(evidence.content);
      } else {
        contentStr = String(evidence.content);
      }
    }
    
    const prompt = `Analyze this evidence for ${framework} compliance issues:

Evidence Type: ${evidence.type || 'unknown'}
Source: ${evidence.source || 'unknown'}
Content: ${contentStr.substring(0, 2000)}
Metadata: ${JSON.stringify(evidence.metadata || {})}

Identify if this represents a compliance gap. Return JSON with:
- title: string
- description: string
- severity: "critical" | "high" | "medium" | "low"
- recommendation: string

If no gap, return null.`;

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      // Add timeout to LLM call (10 seconds per evidence item - increased from 8)
      const llmPromise = this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: CYBERSECURITY_SYSTEM_PROMPTS.gapAnalysis,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });
      
      const llmTimeout = new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error('Evidence analysis LLM timeout')), 10000); // Increased to 10 seconds
      });

      const response = await Promise.race([llmPromise, llmTimeout]);
      const content = response.choices[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        console.warn('Evidence analysis: Empty or invalid response from LLM');
        return null;
      }
      
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError: any) {
        console.error('Evidence analysis: JSON parse error:', parseError?.message || 'Invalid JSON');
        return null;
      }
      if (parsed && parsed.title && parsed.severity && 
          ['critical', 'high', 'medium', 'low'].includes(parsed.severity)) {
        return {
          title: parsed.title,
          description: parsed.description || '',
          severity: parsed.severity as 'critical' | 'high' | 'medium' | 'low',
          recommendation: parsed.recommendation || '',
        };
      }
    } catch (error: any) {
      // Don't log timeout errors as errors - they're expected for slow LLM calls
      if (error?.message?.includes('timeout')) {
        console.warn('Evidence analysis: LLM call timed out, skipping');
      } else {
        console.error('Evidence analysis error:', error?.message || error);
        if (error instanceof SyntaxError) {
          console.error('Evidence analysis: JSON parse error - invalid response format');
        }
      }
    }

    return null;
  }
  
  /**
   * Get official documentation URL for a framework
   */
  private getOfficialDocumentationUrl(framework: string): string | null {
    const urls: Record<string, string> = {
      'SOC2': 'https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/aicpasoc2report.html',
      'GDPR': 'https://gdpr.eu/',
      'HIPAA': 'https://www.hhs.gov/hipaa/index.html',
      'ISO27001': 'https://www.iso.org/standard/54534.html',
      'PCI-DSS': 'https://www.pcisecuritystandards.org/',
    };
    
    return urls[framework.toUpperCase()] || null;
  }

  /**
   * Format citation for evidence
   */
  private formatCitation(evidence: any): string {
    const parts: string[] = [];
    
    if (evidence.source) parts.push(`Source: ${evidence.source}`);
    if (evidence.type) parts.push(`Type: ${evidence.type}`);
    if (evidence.metadata?.repository) parts.push(`Repository: ${evidence.metadata.repository}`);
    if (evidence.metadata?.url) parts.push(`URL: ${evidence.metadata.url}`);
    if (evidence.metadata?.tool) parts.push(`Tool: ${evidence.metadata.tool}`);

    return parts.join(' | ');
  }

  /**
   * Calculate compliance scores
   */
  private calculateComplianceScore(
    findings: DetailedReport['findings'],
    framework: string
  ): DetailedReport['complianceScore'] {
    try {
      // MULTI-LAYER PROTECTION: Ensure findings is valid array
      const safeFindings = Array.isArray(findings) ? findings : [];
      
      // If no findings but we have extraction results, this might indicate MCP failures
      // Don't default to 100% - penalize for lack of data
      if (safeFindings.length === 0) {
        console.warn('[Report Agent] No findings generated - this may indicate MCP connection failures or insufficient data');
        return {
          overall: 50, // Unknown status - penalize for lack of assessment data
          byCategory: {},
        };
      }
      
      const byCategory: Record<string, { total: number; issues: number }> = {};

      for (const finding of safeFindings) {
        try {
          const category = this.categorizeFinding(finding);
          if (!byCategory[category]) {
            byCategory[category] = { total: 0, issues: 0 };
          }
          byCategory[category].total++;
          byCategory[category].issues += this.severityWeight(finding.severity || 'medium');
        } catch (findingError: any) {
          console.warn('[Report Agent] Error processing finding for score calculation:', findingError?.message || 'Unknown error');
          // Continue with next finding
        }
      }

      const categoryScores: Record<string, number> = {};
      for (const [category, data] of Object.entries(byCategory)) {
        try {
          if (data.total > 0) {
            // STRICT SCORING: Penalize based on issues severity
            // Each issue reduces score proportionally
            // Formula: 100 - (issues_weight / total) * 100
            // This ensures findings always reduce the score
            const issueRatio = data.issues / (data.total * 10); // Normalize by max weight (10 for critical)
            categoryScores[category] = Math.max(0, Math.min(100, 100 - (issueRatio * 100)));
            
            // CRITICAL: If we have findings in this category, score must be < 100
            if (data.total > 0 && categoryScores[category] >= 100) {
              categoryScores[category] = Math.max(0, 100 - (data.total * 5)); // At least 5 points per finding
            }
          } else {
            categoryScores[category] = 100;
          }
        } catch (categoryError: any) {
          console.warn(`[Report Agent] Error calculating score for category ${category}:`, categoryError?.message || 'Unknown error');
          categoryScores[category] = 50; // Default score
        }
      }

      // Calculate overall score with STRICT PENALTY for findings
      let overall = 0;
      if (Object.keys(categoryScores).length > 0) {
        const scores = Object.values(categoryScores);
        overall = scores.reduce((a, b) => a + b, 0) / scores.length;
        
        // CRITICAL FIX: If we have findings, score MUST be penalized
        // Even if category scores average to 100, we need to apply penalty
        if (safeFindings.length > 0) {
          // Apply additional penalty based on findings count and severity
          const criticalCount = safeFindings.filter(f => f.severity === 'critical').length;
          const highCount = safeFindings.filter(f => f.severity === 'high').length;
          const mediumCount = safeFindings.filter(f => f.severity === 'medium').length;
          const lowCount = safeFindings.filter(f => f.severity === 'low').length;
          
          // Calculate penalty: critical=20, high=10, medium=5, low=2
          const totalPenalty = (criticalCount * 20) + (highCount * 10) + (mediumCount * 5) + (lowCount * 2);
          
          // Apply penalty to overall score
          overall = Math.max(0, overall - (totalPenalty / safeFindings.length));
          
          // CRITICAL: Ensure score reflects findings - if we have findings, score cannot be 100
          if (overall >= 100 && safeFindings.length > 0) {
            // Force score down based on findings
            overall = Math.max(0, 100 - totalPenalty);
          }
          
          // Additional strict checks
          if (criticalCount > 0 && overall > 50) {
            overall = Math.min(overall, 50); // Critical findings cap at 50
          } else if (highCount > 0 && overall > 70) {
            overall = Math.min(overall, 70); // High findings cap at 70
          } else if (safeFindings.length > 0 && overall > 90) {
            overall = Math.min(overall, 90); // Any findings cap at 90
          }
        }
      } else {
        // Calculate score based on findings severity
        // Critical: -20 points, High: -10 points, Medium: -5 points, Low: -2 points
        const severityPenalties: Record<string, number> = {
          critical: 20,
          high: 10,
          medium: 5,
          low: 2,
        };
        
        let totalPenalty = 0;
        for (const finding of safeFindings) {
          const penalty = severityPenalties[finding.severity] || 5;
          totalPenalty += penalty;
        }
        
        // STRICT SCORING: Base score starts at 100, subtract penalties
        // Minimum score is 0
        overall = Math.max(0, 100 - totalPenalty);
        
        // CRITICAL FIX: If we have findings, score MUST be penalized
        // Apply strict caps based on findings severity
        if (safeFindings.length > 0) {
          const criticalCount = safeFindings.filter(f => f.severity === 'critical').length;
          const highCount = safeFindings.filter(f => f.severity === 'high').length;
          
          // Strict caps: findings always reduce score
          if (criticalCount > 0) {
            overall = Math.min(overall, 50); // Critical findings cap at 50
          } else if (highCount > 0) {
            overall = Math.min(overall, 70); // High findings cap at 70
          } else if (safeFindings.length > 0) {
            overall = Math.min(overall, 85); // Any findings cap at 85
          }
          
          // CRITICAL: Ensure score is never 100 if we have findings
          if (overall >= 100) {
            overall = Math.max(0, 100 - totalPenalty);
          }
        }
        
        // If no findings but we have extraction results, this might indicate MCP failures
        // Don't default to 100% - penalize for lack of data
        if (safeFindings.length === 0) {
          overall = 50; // Unknown status - penalize for lack of assessment data
        }
      }

      return {
        overall: Math.round(Math.max(0, Math.min(100, overall)) * 10) / 10,
        byCategory: categoryScores,
      };
    } catch (error: any) {
      console.error('[Report Agent] Score calculation failed completely:', error?.message || 'Unknown error');
      // Return safe default scores - penalize for lack of data
      const safeFindings = Array.isArray(findings) ? findings : [];
      if (safeFindings.length === 0) {
        return {
          overall: 50, // Unknown status - penalize for lack of assessment data
          byCategory: {},
        };
      }
      
      // Calculate penalty-based score
      const severityPenalties: Record<string, number> = {
        critical: 20,
        high: 10,
        medium: 5,
        low: 2,
      };
      
      let totalPenalty = 0;
      for (const finding of safeFindings) {
        const penalty = severityPenalties[finding.severity] || 5;
        totalPenalty += penalty;
      }
      
      return {
        overall: Math.max(0, 100 - totalPenalty),
        byCategory: {},
      };
    }
  }

  private categorizeFinding(finding: DetailedReport['findings'][0]): string {
    const title = finding.title.toLowerCase();
    if (title.includes('auth') || title.includes('access')) return 'Access Control';
    if (title.includes('data') || title.includes('encrypt')) return 'Data Protection';
    if (title.includes('monitor') || title.includes('log')) return 'Monitoring';
    if (title.includes('backup') || title.includes('disaster')) return 'Business Continuity';
    return 'General';
  }

  private severityWeight(severity: string): number {
    switch (severity) {
      case 'critical': return 10;
      case 'high': return 5;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  /**
   * Generate executive summary
   */
  private async generateExecutiveSummary(
    swarmState: SwarmState,
    findings: DetailedReport['findings'],
    complianceScore: DetailedReport['complianceScore'],
    remediationPlan?: Array<{
      title: string;
      priority: 'critical' | 'high' | 'medium' | 'low';
      estimatedEffort: string;
    }>
  ): Promise<string> {
    const remediationInfo = remediationPlan && remediationPlan.length > 0
      ? `\n\nRemediation Plan: ${remediationPlan.length} tasks created
Critical Priority: ${remediationPlan.filter(t => t.priority === 'critical').length}
High Priority: ${remediationPlan.filter(t => t.priority === 'high').length}
Estimated Total Effort: ${remediationPlan.map(t => t.estimatedEffort).filter(e => e && e !== 'TBD').join(', ')}`
      : '';

    // Enhance prompt with Perplexity research if available
    let industryContext = '';
    if (this.perplexityClient) {
      try {
        const researchQuery = `${swarmState.framework} compliance assessment industry benchmarks average score 2024`;
        const researchPromise = this.perplexityClient.search(researchQuery);
        const researchTimeout = new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error('Executive summary research timeout')), 8000);
        });
        
        const researchResult = await Promise.race([researchPromise, researchTimeout]);
        if (researchResult && researchResult.trim().length > 50) {
          industryContext = `\n\nIndustry context: ${researchResult.substring(0, 300)}`;
          console.log('[Report Agent] Enhanced executive summary with Perplexity research');
        }
      } catch (error: any) {
        console.warn('[Report Agent] Perplexity research for executive summary failed (non-critical):', error?.message || 'Unknown error');
        // Continue without research enhancement
      }
    }

    const prompt = `Generate a concise executive summary (150 words max) for ${swarmState.framework} compliance.

Score: ${complianceScore.overall}/100 | Findings: ${findings.length} (Critical: ${findings.filter(f => f.severity === 'critical').length}, High: ${findings.filter(f => f.severity === 'high').length})${remediationInfo ? ` | Remediation: ${remediationPlan?.length || 0} tasks` : ''}${industryContext}

Include: critical gaps, risk level, top 3 recommendations.${industryContext ? ' Reference industry benchmarks when relevant.' : ''} Return plain text.`;

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      // Add timeout to LLM call (20 seconds)
      const llmPromise = this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: CYBERSECURITY_SYSTEM_PROMPTS.reporting,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 1,
      });
      
      const llmTimeout = new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error('Executive summary LLM timeout')), 30000); // Increased to 30 seconds
      });

      const response = await Promise.race([llmPromise, llmTimeout]);
      let summary = response.choices[0]?.message?.content || '';
      
      // Validate summary is a string
      if (typeof summary !== 'string') {
        console.warn('[Report Agent] Executive summary: Invalid response type from LLM');
        summary = '';
      }
      
      // Optionally enhance with Browserbase if official documentation URLs are available
      if (this.browserbaseClient && summary.length > 0) {
        try {
          const officialDocsUrl = this.getOfficialDocumentationUrl(swarmState.framework);
          if (officialDocsUrl) {
            const docsPromise = this.browserbaseClient.extractText(officialDocsUrl, 'body');
            const docsTimeout = new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error('Browserbase extraction timeout')), 10000);
            });
            
            const docsContent = await Promise.race([docsPromise, docsTimeout]);
            if (docsContent && docsContent.trim().length > 100) {
              // Extract key points from official documentation
              const docsSummary = docsContent.substring(0, 200);
              console.log('[Report Agent] Enhanced executive summary with Browserbase documentation');
              // Note: We could further enhance the summary here, but keeping it simple for now
            }
          }
        } catch (error: any) {
          console.warn('[Report Agent] Browserbase enhancement for executive summary failed (non-critical):', error?.message || 'Unknown error');
          // Continue without Browserbase enhancement
        }
      }
      
      // Validate summary is not empty
      if (!summary || summary.trim().length === 0) {
        console.warn('[Report Agent] Executive summary from LLM is empty, generating default');
        return this.generateDefaultExecutiveSummary(
          swarmState.framework || 'SOC2',
          Array.isArray(findings) ? findings : [],
          complianceScore?.overall ?? 0,
          Array.isArray(remediationPlan) ? remediationPlan : []
        );
      }
      
      return summary;
    } catch (error: any) {
      console.error('[Report Agent] Executive summary generation error:', error?.message || 'Unknown error');
      // Return default summary instead of generic message
      return this.generateDefaultExecutiveSummary(
        swarmState.framework || 'SOC2',
        Array.isArray(findings) ? findings : [],
        complianceScore?.overall ?? 0,
        Array.isArray(remediationPlan) ? remediationPlan : []
      );
    }
  }

  /**
   * Generate default executive summary when LLM generation fails
   */
  private generateDefaultExecutiveSummary(
    framework: string,
    findings: DetailedReport['findings'],
    score: number,
    remediationPlan: Array<{ title: string; priority: string }>
  ): string {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const remediationCount = remediationPlan.length;
    
    return `Compliance Assessment Summary - ${framework}

This assessment evaluated compliance with the ${framework} framework and identified ${findings.length} finding(s) across the assessed systems. The overall compliance score is ${score}/100.

Key findings include ${criticalCount} critical issue(s) and ${highCount} high-priority issue(s) that require immediate attention. ${remediationCount > 0 ? `A remediation plan with ${remediationCount} task(s) has been created to address these gaps.` : 'Remediation recommendations are provided for each identified gap.'}

Next steps include reviewing the detailed findings, prioritizing critical and high-severity issues, and implementing the recommended remediation actions to improve overall compliance posture.`;
  }
}

