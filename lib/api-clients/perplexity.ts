/**
 * Perplexity AI API Client
 * Direct API integration for research (since MCP server package may not exist)
 */

export class PerplexityClient {
  private apiKey: string;
  private baseUrl = 'https://api.perplexity.ai';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<string> {
    // Try different Perplexity models in order of preference
    const models = [
      'llama-3.1-sonar-large-128k-online',
      'llama-3.1-sonar-small-128k-online',
      'sonar',
      'llama-3.1-70b-instruct',
    ];

    for (const model of models) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: query,
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `Perplexity API error: ${response.statusText}`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error?.message || errorMessage;
            // If model is invalid, try next model
            if (errorMessage.includes('Invalid model') && models.indexOf(model) < models.length - 1) {
              continue;
            }
          } catch {
            errorMessage = `${errorMessage} - ${errorText.substring(0, 200)}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          console.warn('Perplexity API returned no content:', JSON.stringify(data));
          return '';
        }
        return content;
      } catch (error: any) {
        // If this is the last model, return empty string
        if (models.indexOf(model) === models.length - 1) {
          console.error('Perplexity search error (all models failed):', error);
          return '';
        }
        // Otherwise, try next model
        continue;
      }
    }

    return '';
  }

  async searchMultiple(queries: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    for (const query of queries) {
      try {
        results[query] = await this.search(query);
      } catch (error: any) {
        console.warn(`Perplexity search failed for query: ${query}`, error.message);
        results[query] = '';
      }
    }

    return results;
  }
}

