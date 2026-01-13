/**
 * Base Extraction Agent
 * Shared functionality to reduce duplication across extraction agents
 */

import { mcpClientManager } from '@/mcp/client';
import { AgentMemory } from '@/lib/memory';
import { ExtractionResult } from './extraction-agents';

export abstract class BaseExtractionAgent {
  protected memory: AgentMemory;
  protected agentName: string;
  protected sourceName: string;

  constructor(agentName: string, projectId: string, sessionId: string, sourceName: string) {
    this.memory = new AgentMemory(agentName, projectId, sessionId);
    this.agentName = agentName;
    this.sourceName = sourceName;
  }

  /**
   * Shared helper to get tool name from various formats
   */
  protected getToolName(t: any): string {
    return typeof t === 'string' ? t : t.name || String(t);
  }

  /**
   * Shared helper to find tool by name variations
   */
  protected findTool(tools: any[], nameVariations: string[]): any {
    return tools.find((t: any) => {
      const name = this.getToolName(t);
      return nameVariations.some(variation => name === variation || name.includes(variation));
    });
  }

  /**
   * Shared helper to parse MCP response
   */
  protected parseMCPResponse(result: any): any {
    if (!result) return null;

    // Already parsed object
    if (typeof result === 'object' && !Array.isArray(result)) {
      // Check for common data structures
      if (result.items || result.data || result.repositories || result.content) {
        return result;
      }
      // Try to find array in values
      const values = Object.values(result);
      const arrayValue = values.find((v: any) => Array.isArray(v));
      if (arrayValue) return { data: arrayValue };
      return result;
    }

    // Array response
    if (Array.isArray(result)) {
      return { data: result };
    }

    // MCP content array format
    if (result.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          try {
            const parsed = JSON.parse(item.text);
            return parsed;
          } catch {
            return { text: item.text };
          }
        }
      }
    }

    return result;
  }

  /**
   * Shared helper to safely call MCP tool
   */
  protected async safeCallTool(
    serverName: string,
    toolName: string,
    params: any = {},
    description?: string
  ): Promise<any> {
    try {
      const result = await mcpClientManager.callTool(serverName, toolName, params);
      return this.parseMCPResponse(result);
    } catch (error: any) {
      const desc = description || toolName;
      console.warn(`${this.sourceName} ${desc} failed:`, error.message);
      return null;
    }
  }

  /**
   * Connect to MCP server and list tools
   */
  protected async connectAndListTools(credentials: any): Promise<{ tools: any[]; toolNames: string[] } | null> {
    try {
      await mcpClientManager.connect(this.sourceName, credentials);
      const tools = await mcpClientManager.listTools(this.sourceName);

      if (!tools || tools.length === 0) {
        console.warn(`${this.sourceName} MCP server returned no tools.`);
        return null;
      }

      const toolNames = tools.map((t: any) => this.getToolName(t));
      console.log(`Available ${this.sourceName} MCP tools:`, toolNames);

      return { tools, toolNames };
    } catch (error: any) {
      console.warn(`Failed to connect to ${this.sourceName}:`, error.message);
      return null;
    }
  }

  /**
   * Abstract method - each agent implements its own extraction logic
   */
  abstract extract(credentials: any): Promise<ExtractionResult>;

  /**
   * Shared method to create result
   */
  protected createResult(data: any, evidence: ExtractionResult['evidence']): ExtractionResult {
    return {
      agent: this.agentName,
      source: this.sourceName,
      data,
      evidence,
      timestamp: new Date(),
    };
  }
}

