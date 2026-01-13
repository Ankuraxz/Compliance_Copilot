/**
 * Vector Store for RAG
 * Uses Supabase with pgvector for vector storage and similarity search
 */

import { createClient } from '@supabase/supabase-js';
import { Chunk } from './chunking';

export interface VectorSearchResult {
  chunk: Chunk;
  similarity: number;
}

export class VectorStore {
  private supabase;
  private tableName = 'compliance_embeddings';

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Generate embeddings using OpenAI with timeout
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
          input: text,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OpenAI embedding error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Embedding generation timeout');
      }
      throw error;
    }
  }

  /**
   * Store chunks with embeddings
   */
  async storeChunks(chunks: Chunk[]): Promise<void> {
    try {
      const embeddings = await Promise.all(
        chunks.map((chunk) => this.generateEmbedding(chunk.content))
      );

      const records = chunks.map((chunk, index) => ({
        id: chunk.id,
        content: chunk.content,
        embedding: embeddings[index],
        metadata: chunk.metadata,
        created_at: new Date().toISOString(),
      }));

      const { error } = await this.supabase.from(this.tableName).upsert(records, {
        onConflict: 'id',
      });

      if (error) {
        // If table doesn't exist, log warning but don't throw
        if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.code === '42P01') {
          console.warn(`[VectorStore] Table ${this.tableName} does not exist. Skipping storage. Please run the database setup SQL from README.md`);
          return;
        }
        console.error(`[VectorStore] Error storing chunks:`, error.message);
        throw new Error(`Vector store error: ${error.message}`);
      }
      
      console.log(`[VectorStore] Successfully stored ${records.length} chunks with embeddings`);
    } catch (error: any) {
      // Gracefully handle table not existing
      if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.code === '42P01') {
        console.warn(`[VectorStore] Table ${this.tableName} does not exist. Skipping storage.`);
        return;
      }
      throw error;
    }
  }

  /**
   * Search for similar chunks
   */
  async similaritySearch(
    query: string,
    limit: number = 10,
    filters?: {
      framework?: string;
      type?: string;
      source?: string;
    }
  ): Promise<VectorSearchResult[]> {
    try {
      console.log(`[VectorStore] Generating embedding for query: "${query.substring(0, 50)}..."`);
      const queryEmbedding = await this.generateEmbedding(query);
      console.log(`[VectorStore] Embedding generated, searching vector store...`);

      // Build RPC call with timeout handling
      // Use lower threshold for better recall, especially when filters are applied
      const matchThreshold = filters ? 0.6 : 0.7;
      const rpcParams: any = {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: limit * 2, // Get more results, we'll filter/rank them
      };

      // Add filters if provided, but make them optional (don't fail if metadata doesn't match exactly)
      if (filters?.framework) {
        rpcParams.framework_filter = filters.framework;
      }
      if (filters?.type) {
        rpcParams.type_filter = filters.type;
      }
      if (filters?.source) {
        rpcParams.source_filter = filters.source;
      }
      
      // Add timeout to RPC call (20 seconds)
      const rpcPromise = this.supabase.rpc('match_compliance_embeddings', rpcParams);
      const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) => {
        setTimeout(() => {
          resolve({ data: null, error: new Error('RPC call timeout') });
        }, 20000);
      });

      let { data, error } = await Promise.race([
        rpcPromise,
        timeoutPromise,
      ]) as any;
      
      // If filtered search returns no results, try without filters
      if ((!data || data.length === 0) && filters && (filters.framework || filters.type || filters.source)) {
        console.log(`[VectorStore] No results with filters, trying without filters...`);
        const broadParams = {
          query_embedding: queryEmbedding,
          match_threshold: 0.6,
          match_count: limit * 2,
        };
        
        try {
          const broadPromise = this.supabase.rpc('match_compliance_embeddings', broadParams);
          const broadTimeout = new Promise<{ data: null; error: Error }>((resolve) => {
            setTimeout(() => {
              resolve({ data: null, error: new Error('RPC call timeout') });
            }, 20000);
          });
          
          const broadResult = await Promise.race([broadPromise, broadTimeout]) as any;
          if (broadResult.data && broadResult.data.length > 0) {
            data = broadResult.data;
            error = broadResult.error;
            console.log(`[VectorStore] Found ${data.length} results without filters`);
          }
        } catch (broadError: any) {
          console.warn(`[VectorStore] Broad search also failed:`, broadError.message);
        }
      }

      if (error) {
        // If RPC function doesn't exist, return empty results
        if (
          error.message?.includes('does not exist') || 
          error.message?.includes('relation') || 
          error.message?.includes('function') ||
          error.code === '42P01' ||
          error.code === '42883'
        ) {
          console.warn(`[VectorStore] RPC function or table does not exist. Returning empty results. Please run the database setup SQL from README.md`);
          return [];
        }
        // If timeout, return empty results
        if (error.message?.includes('timeout')) {
          console.warn(`[VectorStore] RPC call timed out. Returning empty results.`);
          return [];
        }
        throw new Error(`Vector search error: ${error.message}`);
      }

      const results = (data || []).map((item: any) => ({
        chunk: {
          id: item.id,
          content: item.content,
          metadata: item.metadata,
        },
        similarity: item.similarity,
      }));

      console.log(`[VectorStore] Found ${results.length} similar chunks`);
      return results;
    } catch (error: any) {
      // Gracefully handle table/RPC not existing
      if (
        error.message?.includes('does not exist') || 
        error.message?.includes('relation') || 
        error.message?.includes('function') ||
        error.code === '42P01' ||
        error.code === '42883' ||
        error.message?.includes('timeout')
      ) {
        console.warn(`[VectorStore] Search failed: ${error.message}. Returning empty results.`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete chunks by source
   */
  async deleteBySource(source: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('metadata->>source', source);

    if (error) {
      throw new Error(`Delete error: ${error.message}`);
    }
  }
}

