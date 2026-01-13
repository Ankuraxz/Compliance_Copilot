/**
 * Corrective RAG Implementation
 * Implements self-correction loops for improved retrieval accuracy
 */

import { VectorStore, VectorSearchResult } from './vector-store';
import { Chunk } from './chunking';
import OpenAI from 'openai';

export interface CorrectiveRAGResult {
  chunks: Chunk[];
  query: string;
  iterations: number;
  corrections: string[];
}

export class CorrectiveRAG {
  private vectorStore: VectorStore;
  private openai: OpenAI;
  private maxIterations = 3;

  constructor() {
    this.vectorStore = new VectorStore();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Perform Corrective RAG search with self-correction
   */
  async search(
    originalQuery: string,
    context?: string,
    filters?: {
      framework?: string;
      type?: string;
      source?: string;
    }
  ): Promise<CorrectiveRAGResult> {
    let currentQuery = originalQuery;
    const corrections: string[] = [];
    let allResults: VectorSearchResult[] = [];
    const seenChunkIds = new Set<string>();

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      // Search with current query
      const results = await this.vectorStore.similaritySearch(
        currentQuery,
        10,
        filters
      );

      // Add new results (avoid duplicates)
      for (const result of results) {
        if (!seenChunkIds.has(result.chunk.id)) {
          allResults.push(result);
          seenChunkIds.add(result.chunk.id);
        }
      }

      // If we have enough high-quality results, stop
      const highQualityResults = allResults.filter((r) => r.similarity > 0.8);
      if (highQualityResults.length >= 5 && iteration > 0) {
        break;
      }

      // Generate correction for next iteration
      if (iteration < this.maxIterations - 1) {
        const correction = await this.generateQueryCorrection(
          originalQuery,
          currentQuery,
          allResults.slice(0, 5),
          context
        );

        if (correction && correction !== currentQuery) {
          corrections.push(correction);
          currentQuery = correction;
        } else {
          break; // No improvement possible
        }
      }
    }

    // Sort by similarity and return top results
    allResults.sort((a, b) => b.similarity - a.similarity);

    return {
      chunks: allResults.slice(0, 10).map((r) => r.chunk),
      query: currentQuery,
      iterations: corrections.length + 1,
      corrections,
    };
  }

  /**
   * Generate a corrected/improved query based on initial results
   */
  private async generateQueryCorrection(
    originalQuery: string,
    currentQuery: string,
    results: VectorSearchResult[],
    context?: string
  ): Promise<string | null> {
    const resultSnippets = results
      .map((r, i) => `${i + 1}. ${r.chunk.content.substring(0, 200)}...`)
      .join('\n\n');

    const prompt = `You are helping improve a search query for compliance document retrieval.

Original Query: ${originalQuery}
Current Query: ${currentQuery}
${context ? `Context: ${context}` : ''}

Initial Search Results:
${resultSnippets}

Analyze the results and generate an improved, more specific query that will retrieve more relevant compliance requirements. 
Focus on:
1. Technical terms and compliance framework terminology
2. Specific requirement codes or section references
3. Security and privacy concepts mentioned in the results

Return ONLY the improved query, nothing else. If the current query is already optimal, return the same query.`;

    try {
      const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
      
      const modelConfig: any = {
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert at improving search queries for technical compliance documentation.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 1,
      };

      const response = await this.openai.chat.completions.create(modelConfig);

      const correctedQuery = response.choices[0]?.message?.content?.trim();
      return correctedQuery && correctedQuery !== currentQuery
        ? correctedQuery
        : null;
    } catch (error) {
      console.error('Query correction error:', error);
      return null;
    }
  }

  /**
   * Hybrid search: Combine vector search with keyword matching
   */
  async hybridSearch(
    query: string,
    filters?: {
      framework?: string;
      type?: string;
      source?: string;
    }
  ): Promise<Chunk[]> {
    // Vector search
    const vectorResults = await this.vectorStore.similaritySearch(query, 10, filters);

    // Keyword search (simple implementation - in production, use full-text search)
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    
    // Combine and deduplicate
    const combined = new Map<string, { chunk: Chunk; score: number }>();

    // Add vector results with weight 0.7
    for (const result of vectorResults) {
      combined.set(result.chunk.id, {
        chunk: result.chunk,
        score: result.similarity * 0.7,
      });
    }

    // Add keyword matches with weight 0.3
    // In production, this would query a full-text search index
    // For now, we'll enhance vector results with keyword scoring
    if (keywords.length > 0) {
      for (const [id, item] of combined.entries()) {
        const content = item.chunk.content?.toLowerCase() || '';
        const keywordMatches = keywords.filter((kw) => content.includes(kw)).length;
        item.score += (keywordMatches / keywords.length) * 0.3;
      }
    }

    // Sort by combined score
    const sorted = Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return sorted.map((item) => item.chunk);
  }
}

