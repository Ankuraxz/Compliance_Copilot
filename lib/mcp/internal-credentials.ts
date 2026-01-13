/**
 * Internal SaaS Credentials
 * These are for internal SaaS tools (Firecrawl, Perplexity, Browserbase)
 * that are used by LLM agents, not by end users
 */

export function getInternalMCPCredentials(serverName: string): any {
  switch (serverName) {
    case 'firecrawl':
      if (!process.env.FIRECRAWL_API_KEY) {
        throw new Error('FIRECRAWL_API_KEY not configured');
      }
      return {
        apiKey: process.env.FIRECRAWL_API_KEY,
      };

    case 'perplexity':
      if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error('PERPLEXITY_API_KEY not configured');
      }
      return {
        apiKey: process.env.PERPLEXITY_API_KEY,
      };

    case 'browserbase':
      if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
        throw new Error('BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be configured');
      }
      return {
        apiKey: process.env.BROWSERBASE_API_KEY,
        customEnv: {
          BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
          BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
        },
      };

    default:
      throw new Error(`Unknown internal MCP server: ${serverName}`);
  }
}

export function isInternalMCPServer(serverName: string): boolean {
  return ['firecrawl', 'perplexity', 'browserbase'].includes(serverName);
}

