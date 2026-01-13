/**
 * MEM0-style Memory Management with Redis
 * Provides persistent memory for AI agents using Redis as vector store
 */

import { createClient } from 'redis';
import OpenAI from 'openai';

// Singleton Redis client connection pool (defined before class to be accessible)
let sharedRedisClient: ReturnType<typeof createClient> | null = null;
let sharedRedisUrl: string | null = null;
let connectionPromise: Promise<void> | null = null;

/**
 * Get or create a shared Redis client connection
 * This ensures all Mem0Redis instances share the same connection
 */
function getSharedRedisClient(redisUrl?: string): ReturnType<typeof createClient> {
  const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
  
  // If we already have a client for this URL, reuse it
  if (sharedRedisClient && sharedRedisUrl === url) {
    return sharedRedisClient;
  }
  
  // Reset connection promise if URL changed
  if (sharedRedisUrl !== url) {
    connectionPromise = null;
  }
  
  // Create new client with connection pooling for multi-user support
  sharedRedisClient = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('Redis connection failed after 10 retries');
          return new Error('Redis connection failed');
        }
        return Math.min(retries * 100, 3000);
      },
      // Connection timeout for multi-user scenarios
      connectTimeout: 10000, // 10 seconds
      // Keep connection alive
      keepAlive: 30000, // 30 seconds
    },
    // Connection pool settings
    // Note: Redis client handles pooling internally, but we set reasonable limits
  });
  
  sharedRedisUrl = url;
  
  // Handle connection errors
  sharedRedisClient.on('error', (err) => {
    console.error('Redis client error:', err);
  });
  
  // Initialize connection once
  if (!connectionPromise) {
    connectionPromise = (async () => {
      try {
        if (!sharedRedisClient!.isOpen) {
          await sharedRedisClient.connect();
        }
      } catch (error: any) {
        console.warn('Failed to connect to Redis (memory will be disabled):', error.message);
        connectionPromise = null; // Reset so we can retry later
        // Don't throw - allow graceful degradation
        return;
      }
    })();
  }
  
  return sharedRedisClient;
}

export interface Memory {
  id: string;
  content: string;
  metadata: {
    agent: string;
    projectId?: string;
    sessionId?: string;
    timestamp: Date;
    category?: string;
    [key: string]: any;
  };
  embedding?: number[];
}

export interface MemorySearchResult {
  memory: Memory;
  similarity: number;
}

export class Mem0Redis {
  private redis: ReturnType<typeof createClient>;
  private openai: OpenAI;
  private collectionName: string;
  private embeddingModel: string = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  private embeddingDims: number = parseInt(process.env.OPENAI_EMBEDDING_DIMS || '1536');
  // TTL: 12 hours in seconds (12 * 60 * 60 = 43200)
  // This ensures Redis memory entries automatically expire after 12 hours to save space
  private readonly TTL_SECONDS = 12 * 60 * 60;

  constructor(redisUrl?: string, collectionName: string = 'agent_memories') {
    // Use shared Redis client to avoid connection exhaustion
    this.redis = getSharedRedisClient(redisUrl);
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.collectionName = collectionName;
  }

  /**
   * Connect to Redis
   * Uses shared connection, so this is mostly a no-op
   * but ensures the connection is established
   * Returns false if connection fails (graceful failure)
   */
  async connect(): Promise<boolean> {
    try {
      // Wait for shared connection to be established
      if (connectionPromise) {
        try {
          await connectionPromise;
        } catch (error) {
          // Connection promise failed, reset it
          connectionPromise = null;
          return false;
        }
      }
      
      // Double-check connection is open
      if (!this.redis.isOpen) {
        try {
          await this.redis.connect();
        } catch (error: any) {
          // If connection fails, it might be because it's already connecting
          // Wait a bit and check again
          if (error.message?.includes('already connecting') || error.message?.includes('Client is already connecting')) {
            // Wait for connection to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!this.redis.isOpen) {
              return false;
            }
          } else {
            return false;
          }
        }
      }
      return true;
    } catch (error: any) {
      console.warn('Redis connection failed:', error.message);
      return false;
    }
  }

  /**
   * Disconnect from Redis
   * Note: With shared connections, we don't disconnect here
   * to avoid breaking other instances. Connection cleanup happens
   * at application shutdown.
   */
  async disconnect(): Promise<void> {
    // Don't disconnect shared connections - let them be managed centrally
    // This prevents one agent from disconnecting others
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * Add memory to Redis
   * Returns empty string if connection fails (graceful failure)
   */
  async add(
    content: string | Array<{ role: string; content: string }>,
    metadata: {
      agent: string;
      projectId?: string;
      sessionId?: string;
      category?: string;
      [key: string]: any;
    }
  ): Promise<string> {
    const connected = await this.connect();
    if (!connected) {
      return ''; // Return empty string if connection failed
    }

    // Convert messages array to text if needed
    const textContent =
      typeof content === 'string'
        ? content
        : content.map((m) => `${m.role}: ${m.content}`).join('\n');

    // Generate embedding
    const embedding = await this.generateEmbedding(textContent);

    // Create memory object
    const memoryId = `mem:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    const memory: Memory = {
      id: memoryId,
      content: textContent,
      metadata: {
        ...metadata,
        timestamp: new Date(),
      },
      embedding,
    };

    // Store in Redis
    // Using JSON storage with vector index (requires Redis Stack with RedisVL)
    const key = `${this.collectionName}:${memoryId}`;
    
    // Store memory data with TTL (12 hours)
    await this.redis.set(
      key,
      JSON.stringify({
        content: memory.content,
        metadata: memory.metadata,
        embedding: memory.embedding,
      }),
      {
        EX: this.TTL_SECONDS, // Set TTL to 12 hours
      }
    );

    // Add to sorted set for retrieval by agent/project
    const indexKey = `${this.collectionName}:index:${metadata.agent}`;
    await this.redis.zAdd(indexKey, {
      score: Date.now(),
      value: memoryId,
    });
    // Set TTL on index key as well (12 hours)
    await this.redis.expire(indexKey, this.TTL_SECONDS);

    if (metadata.projectId) {
      const projectIndexKey = `${this.collectionName}:index:project:${metadata.projectId}`;
      await this.redis.zAdd(projectIndexKey, {
        score: Date.now(),
        value: memoryId,
      });
      // Set TTL on project index key as well (12 hours)
      await this.redis.expire(projectIndexKey, this.TTL_SECONDS);
    }

    return memoryId;
  }

  /**
   * Search memories by similarity
   * Returns empty array if connection fails (graceful failure)
   */
  async search(
    query: string,
    options: {
      agent?: string;
      projectId?: string;
      limit?: number;
      threshold?: number;
      category?: string;
    } = {}
  ): Promise<MemorySearchResult[]> {
    const connected = await this.connect();
    if (!connected) {
      return []; // Return empty array if connection failed
    }

    const {
      agent,
      projectId,
      limit = 10,
      threshold = 0.7,
      category,
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Get candidate memory IDs
    let candidateIds: string[] = [];

    if (agent) {
      const indexKey = `${this.collectionName}:index:${agent}`;
      const ids = await this.redis.zRange(indexKey, 0, -1);
      candidateIds = [...candidateIds, ...ids];
    }

    if (projectId) {
      const projectIndexKey = `${this.collectionName}:index:project:${projectId}`;
      const ids = await this.redis.zRange(projectIndexKey, 0, -1);
      candidateIds = [...candidateIds, ...ids];
    }

    // Remove duplicates
    candidateIds = [...new Set(candidateIds)];

    if (candidateIds.length === 0) {
      return [];
    }

    // Retrieve and score memories
    const results: MemorySearchResult[] = [];

    for (const memoryId of candidateIds) {
      const key = `${this.collectionName}:${memoryId}`;
      let data: string | null;
      
      try {
        data = await this.redis.get(key);
      } catch (getError: any) {
        // Handle expired entries or connection issues gracefully
        if (getError?.message?.includes('expired') || getError?.message?.includes('not found')) {
          // Remove from index if expired
          try {
            if (agent) {
              const indexKey = `${this.collectionName}:index:${agent}`;
              await this.redis.zRem(indexKey, memoryId);
            }
            if (projectId) {
              const projectIndexKey = `${this.collectionName}:index:project:${projectId}`;
              await this.redis.zRem(projectIndexKey, memoryId);
            }
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        }
        continue;
      }

      if (!data) continue;

      try {
        const memoryData = JSON.parse(data);
        const memory: Memory = {
          id: memoryId,
          content: memoryData.content,
          metadata: memoryData.metadata,
          embedding: memoryData.embedding,
        };

        // Filter by category if specified
        if (category && memory.metadata.category !== category) {
          continue;
        }

        // Calculate cosine similarity
        if (memory.embedding) {
          const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding);

          if (similarity >= threshold) {
            results.push({
              memory,
              similarity,
            });
          }
        }
      } catch (parseError) {
        // Skip invalid JSON entries
        console.warn(`[Mem0Redis] Failed to parse memory ${memoryId} during search:`, parseError);
      }
    }

    // Sort by similarity and return top results
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Get all memories for an agent/project
   * Returns empty array if connection fails (graceful failure)
   */
  async getAll(
    options: {
      agent?: string;
      projectId?: string;
      limit?: number;
    } = {}
  ): Promise<Memory[]> {
    const connected = await this.connect();
    if (!connected) {
      return []; // Return empty array if connection failed
    }

    const { agent, projectId, limit = 100 } = options;

    let memoryIds: string[] = [];

    if (agent) {
      const indexKey = `${this.collectionName}:index:${agent}`;
      const ids = await this.redis.zRange(indexKey, 0, limit - 1);
      memoryIds = [...memoryIds, ...ids];
    }

    if (projectId) {
      const projectIndexKey = `${this.collectionName}:index:project:${projectId}`;
      const ids = await this.redis.zRange(projectIndexKey, 0, limit - 1);
      memoryIds = [...memoryIds, ...ids];
    }

    memoryIds = [...new Set(memoryIds)];

    const memories: Memory[] = [];

    for (const memoryId of memoryIds) {
      const key = `${this.collectionName}:${memoryId}`;
      const data = await this.redis.get(key);

      if (data) {
        const memoryData = JSON.parse(data);
        memories.push({
          id: memoryId,
          content: memoryData.content,
          metadata: memoryData.metadata,
          embedding: memoryData.embedding,
        });
      }
    }

    // Sort by timestamp (newest first)
    memories.sort(
      (a, b) =>
        new Date(b.metadata.timestamp).getTime() -
        new Date(a.metadata.timestamp).getTime()
    );

    return memories;
  }

  /**
   * Delete memory by ID
   * Gracefully handles connection failures
   */
  async delete(memoryId: string): Promise<void> {
    const connected = await this.connect();
    if (!connected) {
      return; // Silently fail if connection failed
    }

    const key = `${this.collectionName}:${memoryId}`;
    const data = await this.redis.get(key);

    if (data) {
      const memoryData = JSON.parse(data);
      const metadata = memoryData.metadata;

      // Delete from main store
      await this.redis.del(key);

      // Remove from indices
      if (metadata.agent) {
        const indexKey = `${this.collectionName}:index:${metadata.agent}`;
        await this.redis.zRem(indexKey, memoryId);
      }

      if (metadata.projectId) {
        const projectIndexKey = `${this.collectionName}:index:project:${metadata.projectId}`;
        await this.redis.zRem(projectIndexKey, memoryId);
      }
    }
  }

  /**
   * Delete all memories for an agent/project
   * Returns 0 if connection fails (graceful failure)
   */
  async deleteAll(
    options: {
      agent?: string;
      projectId?: string;
    } = {}
  ): Promise<number> {
    const connected = await this.connect();
    if (!connected) {
      return 0; // Return 0 if connection failed
    }

    const { agent, projectId } = options;
    const memories = await this.getAll({ agent, projectId, limit: 1000 });

    let deleted = 0;
    for (const memory of memories) {
      await this.delete(memory.id);
      deleted++;
    }

    return deleted;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Update memory
   * Gracefully handles connection failures
   */
  async update(
    memoryId: string,
    updates: {
      content?: string;
      metadata?: Partial<Memory['metadata']>;
    }
  ): Promise<void> {
    const connected = await this.connect();
    if (!connected) {
      return; // Silently fail if connection failed
    }

    const key = `${this.collectionName}:${memoryId}`;
    const data = await this.redis.get(key);

    if (!data) {
      throw new Error(`Memory ${memoryId} not found`);
    }

    const memoryData = JSON.parse(data);
    const updatedMemory: Memory = {
      id: memoryId,
      content: updates.content || memoryData.content,
      metadata: {
        ...memoryData.metadata,
        ...updates.metadata,
      },
      embedding: memoryData.embedding,
    };

    // Regenerate embedding if content changed
    if (updates.content) {
      updatedMemory.embedding = await this.generateEmbedding(updates.content);
    }

    // Update memory data and refresh TTL
    await this.redis.set(
      key,
      JSON.stringify({
        content: updatedMemory.content,
        metadata: updatedMemory.metadata,
        embedding: updatedMemory.embedding,
      }),
      {
        EX: this.TTL_SECONDS, // Refresh TTL to 12 hours on update
      }
    );
    
    // Also refresh TTL on index keys
    if (updatedMemory.metadata.agent) {
      const indexKey = `${this.collectionName}:index:${updatedMemory.metadata.agent}`;
      try {
        await this.redis.expire(indexKey, this.TTL_SECONDS);
      } catch (e) {
        // Ignore if index doesn't exist
      }
    }
    
    if (updatedMemory.metadata.projectId) {
      const projectIndexKey = `${this.collectionName}:index:project:${updatedMemory.metadata.projectId}`;
      try {
        await this.redis.expire(projectIndexKey, this.TTL_SECONDS);
      } catch (e) {
        // Ignore if index doesn't exist
      }
    }
  }
}

// Singleton instance
let mem0Instance: Mem0Redis | null = null;

export function getMem0Instance(): Mem0Redis {
  if (!mem0Instance) {
    mem0Instance = new Mem0Redis();
  }
  return mem0Instance;
}

