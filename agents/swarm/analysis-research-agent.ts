/**
 * Analysis & Research Agent
 * Phase 3: Analyzes extracted data using Firecrawl, Perplexity, and Browserbase
 */

import OpenAI from 'openai';
import { AgentMemory } from '@/lib/memory';
// Temperature always set to 1 globally
import { ExtractionResult } from './extraction-agents';
import { AssessmentPlan } from './planning-agent';
import { FirecrawlClient } from '@/lib/api-clients/firecrawl';
import { PerplexityClient } from '@/lib/api-clients/perplexity';
import { BrowserbaseClient } from '@/lib/api-clients/browserbase';
import { CYBERSECURITY_SYSTEM_PROMPTS, OPTIMIZED_PROMPTS } from '@/lib/prompts/cybersecurity-prompts';

export interface AnalysisResult {
  findings: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    evidence: Array<{
      source: string;
      type: string;
      content: string;
      url?: string;
    }>;
    recommendation: string;
    researchContext?: string;
  }>;
  insights: string[];
  complianceGaps: Array<{
    requirement: string;
    status: 'compliant' | 'non-compliant' | 'partial';
    evidence: string[];
  }>;
}

export class AnalysisResearchAgent {
  private openai: OpenAI;
  private memory: AgentMemory;

  constructor(projectId: string, sessionId: string) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.memory = new AgentMemory('analysis-research-agent', projectId, sessionId);
  }

  /**
   * Analyze extracted data and perform research
   */
  async analyze(
    extractionResults: ExtractionResult[],
    plan: AssessmentPlan,
    framework: string
  ): Promise<AnalysisResult> {
    // Step 1: Research compliance requirements using Perplexity
    const researchContext = await this.performResearch(plan, framework);

    // Step 2: Scrape relevant documentation using Firecrawl
    const documentationContext = await this.scrapeDocumentation(plan, framework);

    // Step 3: Analyze extracted data with research context
    const analysis = await this.analyzeWithContext(
      extractionResults,
      plan,
      framework,
      researchContext,
      documentationContext
    );

    // Step 4: Use Browserbase for dynamic content if needed
    const enhancedAnalysis = await this.enhanceWithBrowserbase(analysis, plan);

    // Store analysis in memory
    await this.memory.remember(
      `Analysis completed. Found ${enhancedAnalysis.findings.length} findings across ${plan.focusAreas.length} focus areas`,
      'analysis',
      {
        findingsCount: enhancedAnalysis.findings.length,
        framework,
        focusAreas: plan.focusAreas.length,
      }
    );

    return enhancedAnalysis;
  }

  /**
   * Research compliance requirements using Perplexity
   */
  private async performResearch(plan: AssessmentPlan, framework: string): Promise<string> {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        console.warn('Perplexity API key not available');
        return '';
      }

      const perplexityClient = new PerplexityClient(apiKey);

      const researchQueries = plan.focusAreas.map((area) => {
        return `${framework} ${area.category} compliance requirements ${area.requirements.join(' ')} best practices`;
      });

      const researchResults: string[] = [];

      for (const query of researchQueries.slice(0, 3)) {
        // Limit to 3 queries to avoid rate limits
        try {
          const result = await perplexityClient.search(query);
          if (result && result.trim().length > 0) {
            researchResults.push(result.substring(0, 2000)); // Limit each result
          }
        } catch (error: any) {
          console.warn(`Perplexity research failed for query: ${query.substring(0, 50)}...`, error.message);
          // Continue with other queries
        }
      }

      return researchResults.join('\n\n---\n\n');
    } catch (error) {
      console.error('Research phase error:', error);
      return '';
    }
  }

  /**
   * Scrape compliance documentation using Firecrawl
   */
  private async scrapeDocumentation(plan: AssessmentPlan, framework: string): Promise<string> {
    try {
      const apiKey = process.env.FIRECRAWL_API_KEY;
      if (!apiKey) {
        console.warn('Firecrawl API key not available');
        return '';
      }

      const firecrawlClient = new FirecrawlClient(apiKey);

      const docUrls = this.getDocumentationUrls(framework);
      const scrapedContent: string[] = [];

      for (const url of docUrls.slice(0, 3)) {
        // Limit to 3 URLs
        try {
          const content = await firecrawlClient.scrape(url);
          scrapedContent.push(content.substring(0, 2000)); // Limit each scrape
        } catch (error) {
          console.warn(`Firecrawl scrape failed for URL: ${url}`, error);
        }
      }

      return scrapedContent.join('\n\n---\n\n');
    } catch (error) {
      console.error('Documentation scraping error:', error);
      return '';
    }
  }

  /**
   * Analyze extracted data with research context
   */
  private async analyzeWithContext(
    extractionResults: ExtractionResult[],
    plan: AssessmentPlan,
    framework: string,
    researchContext: string,
    documentationContext: string
  ): Promise<AnalysisResult> {
    // Build context from extraction results
    const extractionContext = this.buildExtractionContext(extractionResults);

    // Optimize context sizes
    const limitedExtraction = extractionContext.substring(0, 6000);
    const limitedResearch = researchContext.substring(0, 3000);
    const limitedDocs = documentationContext.substring(0, 2000);

    const prompt = OPTIMIZED_PROMPTS.analyzeCompliance(
      framework,
      `Assessment Plan: ${JSON.stringify(plan, null, 2)}\n\nExtracted Data: ${limitedExtraction}`,
      `Research: ${limitedResearch}\n\nDocumentation: ${limitedDocs}`
    );

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';

      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: CYBERSECURITY_SYSTEM_PROMPTS.analysis,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      });

      const analysis: AnalysisResult = JSON.parse(response.choices[0]?.message?.content || '{}');
      return analysis;
    } catch (error: any) {
      console.error('Analysis error:', error);
      return {
        findings: [],
        insights: ['Analysis could not be completed due to an error'],
        complianceGaps: [],
      };
    }
  }

  /**
   * Enhance analysis with Browserbase for dynamic content
   */
  private async enhanceWithBrowserbase(
    analysis: AnalysisResult,
    plan: AssessmentPlan
  ): Promise<AnalysisResult> {
    try {
      const apiKey = process.env.BROWSERBASE_API_KEY;
      const projectId = process.env.BROWSERBASE_PROJECT_ID;
      
      if (!apiKey || !projectId) {
        return analysis; // Skip if not available
      }

      const browserbaseClient = new BrowserbaseClient(apiKey, projectId);

      // Use Browserbase to verify findings or gather additional evidence
      // For now, we'll just return the analysis as-is
      // In production, you could scrape specific URLs related to findings

      return analysis;
    } catch (error) {
      console.warn('Browserbase enhancement skipped:', error);
      return analysis;
    }
  }

  /**
   * Build context string from extraction results
   */
  private buildExtractionContext(extractionResults: ExtractionResult[]): string {
    const contextParts: string[] = [];

    for (const result of extractionResults) {
      contextParts.push(`\n=== ${result.agent} (${result.source}) ===`);
      contextParts.push(`Data: ${JSON.stringify(result.data, null, 2).substring(0, 2000)}`);
      contextParts.push(`Evidence Count: ${result.evidence.length}`);
    }

    return contextParts.join('\n');
  }

  /**
   * Get documentation URLs for framework
   */
  private getDocumentationUrls(framework: string): string[] {
    const urls: Record<string, string[]> = {
      SOC2: [
        'https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/aicpasoc2report.html',
        'https://www.vanta.com/resources/soc-2-compliance-guide',
      ],
      GDPR: [
        'https://gdpr.eu/what-is-gdpr/',
        'https://www.gdpr.eu/checklist/',
      ],
      HIPAA: [
        'https://www.hhs.gov/hipaa/index.html',
        'https://www.hhs.gov/hipaa/for-professionals/security/index.html',
      ],
    };

    return urls[framework.toUpperCase()] || [];
  }
}

