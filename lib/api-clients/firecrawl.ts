/**
 * Firecrawl API Client
 * Direct API integration for web scraping (since MCP server package doesn't exist)
 */

export class FirecrawlClient {
  private apiKey: string;
  private baseUrl = 'https://api.firecrawl.dev/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async scrape(url: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
        }),
      });

      if (!response.ok) {
        throw new Error(`Firecrawl API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data?.markdown || data.data?.content || JSON.stringify(data);
    } catch (error: any) {
      console.error('Firecrawl scrape error:', error);
      throw new Error(`Failed to scrape ${url}: ${error.message}`);
    }
  }

  async scrapeMultiple(urls: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    for (const url of urls) {
      try {
        results[url] = await this.scrape(url);
      } catch (error: any) {
        console.warn(`Failed to scrape ${url}:`, error.message);
        results[url] = '';
      }
    }

    return results;
  }
}

