/**
 * Browserbase API Client
 * Direct API integration for browser automation (since MCP server package doesn't exist)
 */

export class BrowserbaseClient {
  private apiKey: string;
  private projectId: string;
  private baseUrl = 'https://www.browserbase.com/v1';

  constructor(apiKey: string, projectId: string) {
    this.apiKey = apiKey;
    this.projectId = projectId;
  }

  async navigate(url: string, waitForSelector?: string): Promise<string> {
    try {
      // Create a session
      const sessionResponse = await fetch(`${this.baseUrl}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'x-browserbase-project-id': this.projectId,
        },
        body: JSON.stringify({
          url,
          waitForSelector: waitForSelector || 'body',
        }),
      });

      if (!sessionResponse.ok) {
        throw new Error(`Browserbase API error: ${sessionResponse.statusText}`);
      }

      const sessionData = await sessionResponse.json();
      const sessionId = sessionData.id;

      // Get page content
      const contentResponse = await fetch(`${this.baseUrl}/sessions/${sessionId}/content`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'x-browserbase-project-id': this.projectId,
        },
      });

      if (!contentResponse.ok) {
        throw new Error(`Failed to get content: ${contentResponse.statusText}`);
      }

      const contentData = await contentResponse.json();
      return contentData.text || contentData.content || '';
    } catch (error: any) {
      console.error('Browserbase navigate error:', error);
      throw new Error(`Failed to navigate to ${url}: ${error.message}`);
    }
  }

  async extractText(url: string, selector: string = 'body'): Promise<string> {
    try {
      const content = await this.navigate(url, selector);
      // Extract text from HTML if needed
      return content;
    } catch (error: any) {
      console.error('Browserbase extractText error:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  }
}

