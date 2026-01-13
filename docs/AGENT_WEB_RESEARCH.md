# Agent Web Research Integration

This document explains how LLM agents use Firecrawl, Perplexity AI, and Browserbase for web search and information extraction.

## Overview

The Compliance Copilot agents automatically use three internal SaaS tools for web research and information extraction:

1. **Perplexity AI** - Real-time web search and research
2. **Firecrawl** - Web scraping and content extraction
3. **Browserbase** - Browser automation for dynamic content

These tools are **internal SaaS tools** (not user-facing) and use credentials from environment variables.

## Configuration

Set these environment variables in your `.env` file:

```env
# Perplexity AI (for web research)
PERPLEXITY_API_KEY="your_perplexity_api_key"

# Firecrawl (for web scraping)
FIRECRAWL_API_KEY="your_firecrawl_api_key"

# Browserbase (for browser automation)
BROWSERBASE_API_KEY="your_browserbase_api_key"
BROWSERBASE_PROJECT_ID="your_browserbase_project_id"
```

## Agent Integration

### 1. Regulation RAG Agent

**Location**: `agents/regulation-rag-agent.ts`

**Uses**:
- **Perplexity**: Searches for latest compliance requirements and best practices
- **Firecrawl**: Scrapes official compliance documentation websites

**When**: During requirement retrieval phase

**Example**:
```typescript
// Perplexity research
const researchQuery = `${framework} compliance requirements ${techStack?.services?.join(' ') || ''} best practices 2024`;
const researchResult = await mcpClientManager.callTool('perplexity', 'search', {
  query: researchQuery,
});

// Firecrawl scraping
const scraped = await mcpClientManager.callTool('firecrawl', 'scrape', {
  url: 'https://gdpr.eu/what-is-gdpr/',
});
```

### 2. Gap Analysis Agent

**Location**: `agents/gap-analysis-agent.ts`

**Uses**:
- **Perplexity**: Researches remediation best practices for identified gaps
- **Firecrawl**: Scrapes compliance documentation for evidence

**When**: 
- During evidence collection phase
- During recommendation generation phase

**Example**:
```typescript
// Research remediation best practices
const bestPracticeQuery = `${gap.requirementCode} ${gap.title} remediation implementation guide`;
const practiceResult = await mcpClientManager.callTool('perplexity', 'search', {
  query: bestPracticeQuery,
});

// Scrape compliance documentation
const scraped = await mcpClientManager.callTool('firecrawl', 'scrape', {
  url: complianceDocUrl,
});
```

### 3. Swarm Manager Agent

**Location**: `agents/swarm/manager-agent.ts`

**Uses**:
- **Firecrawl**: Extracts content from framework-specific documentation
- **Perplexity**: Researches compliance requirements and common gaps
- **Browserbase**: Extracts content from dynamic compliance websites

**When**: During analysis extraction phase

**Example**:
```typescript
// Firecrawl extraction
const firecrawlCreds = getInternalMCPCredentials('firecrawl');
const firecrawlAgent = new FirecrawlExtractionAgent(projectId, userId);
const frameworkDocs = this.getFrameworkDocumentationUrls(framework);
const firecrawlResult = await firecrawlAgent.extract(frameworkDocs, firecrawlCreds);

// Perplexity research
const perplexityCreds = getInternalMCPCredentials('perplexity');
const perplexityAgent = new PerplexityExtractionAgent(projectId, userId);
const queries = [
  `${framework} compliance requirements 2024`,
  `${framework} best practices implementation`,
  `${framework} common compliance gaps`,
];
const perplexityResult = await perplexityAgent.extract(queries, perplexityCreds);

// Browserbase extraction
const browserbaseCreds = getInternalMCPCredentials('browserbase');
const browserbaseAgent = new BrowserbaseExtractionAgent(projectId, userId);
const complianceUrls = this.getComplianceDocumentationUrls(framework);
const browserbaseResult = await browserbaseAgent.extract(complianceUrls, browserbaseCreds);
```

## Internal Credentials Helper

**Location**: `lib/mcp/internal-credentials.ts`

The `getInternalMCPCredentials()` function retrieves credentials from environment variables:

```typescript
import { getInternalMCPCredentials } from '@/lib/mcp/internal-credentials';

// Get credentials for internal SaaS tools
const perplexityCreds = getInternalMCPCredentials('perplexity');
const firecrawlCreds = getInternalMCPCredentials('firecrawl');
const browserbaseCreds = getInternalMCPCredentials('browserbase');
```

## Framework Documentation URLs

The agents automatically use framework-specific documentation URLs:

### SOC2
- `https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/aicpasoc2report.html`
- `https://www.vanta.com/resources/soc-2-compliance-guide`

### GDPR
- `https://gdpr.eu/what-is-gdpr/`
- `https://www.gdpr.eu/checklist/`

### HIPAA
- `https://www.hhs.gov/hipaa/index.html`
- `https://www.hhs.gov/hipaa/for-professionals/security/index.html`

## Benefits

1. **Real-time Research**: Perplexity provides up-to-date compliance information
2. **Comprehensive Coverage**: Firecrawl scrapes official documentation
3. **Dynamic Content**: Browserbase handles JavaScript-rendered pages
4. **Enhanced Evidence**: Web research provides additional evidence for findings
5. **Better Recommendations**: Best practices research improves remediation suggestions

## Error Handling

All web research operations are wrapped in try-catch blocks. If a tool fails, the agent continues with other methods:

```typescript
try {
  const result = await mcpClientManager.callTool('perplexity', 'search', { query });
  // Use result
} catch (error) {
  console.warn('Perplexity research failed, continuing with RAG only:', error);
  // Continue without web research
}
```

## Storage

Web research results are stored in:
1. **Vector Store**: Perplexity and Firecrawl results are embedded and stored for future retrieval
2. **Agent Memory**: Results are remembered using MEM0/Redis for context
3. **Evidence**: Results are attached as evidence to compliance findings

## Notes

- These tools are **internal SaaS tools** and are not exposed to end users
- Credentials come from environment variables, not user connections
- Tools are used automatically by agents when needed
- Results enhance compliance analysis but don't replace core RAG functionality

