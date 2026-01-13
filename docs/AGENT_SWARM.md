# Agent Swarm Architecture

## Overview

The Agent Swarm system enables parallel data extraction from multiple MCP servers, coordinated by a manager agent, and synthesized into comprehensive compliance reports with proper evidence citations.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Swarm Manager Agent                        │
│         (Coordinates & Aggregates)                      │
└─────────────────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
┌───────▼──────┐ ┌──▼──────┐ ┌─▼──────────┐
│ AWS Agent    │ │ GitHub  │ │ SonarQube │
│              │ │ Agent   │ │ Agent     │
└──────────────┘ └─────────┘ └───────────┘
        │           │           │
        └───────────┼───────────┘
                    │
        ┌───────────▼───────────┐
        │   Report Agent        │
        │ (Evidence Citations)  │
        └───────────────────────┘
```

## Extraction Agents

### 1. AWS Extraction Agent
- **Source**: AWS Core MCP Server
- **Extracts**: Infrastructure, deployments, databases, services
- **Tools**: `prompt_understanding`, AWS API tools
- **Auth**: BYOK (AWS credentials)

### 2. GitHub Extraction Agent
- **Source**: GitHub MCP Server
- **Extracts**: Repository structure, code files, dependencies
- **Tools**: `list_repos`, `get_contents`, `get_file`, `search_code`
- **Auth**: OAuth or BYOK (Personal Access Token)

### 3. SonarQube Extraction Agent
- **Source**: SonarQube MCP Server
- **Extracts**: Quality metrics, vulnerabilities, code smells, coverage
- **Tools**: SonarQube API tools
- **Auth**: BYOK (API token)

### 4. Sentry Extraction Agent
- **Source**: Sentry MCP Server
- **Extracts**: Error logs, performance data, releases
- **Tools**: Sentry API tools
- **Auth**: BYOK (API token)

### 5. Atlassian Extraction Agent
- **Source**: Atlassian MCP Server
- **Extracts**: JIRA tickets, Confluence pages
- **Tools**: Atlassian API tools
- **Auth**: OAuth or BYOK (API token)

### 6. Firecrawl Extraction Agent
- **Source**: Firecrawl MCP Server
- **Extracts**: Web content, documentation
- **Tools**: `scrape`
- **Auth**: BYOK (API key)

### 7. Perplexity Extraction Agent
- **Source**: Perplexity AI MCP Server
- **Extracts**: Research results, analysis data
- **Tools**: `search`
- **Auth**: BYOK (API key)

## Manager Agent

The Swarm Manager Agent:
1. **Orchestrates** parallel extraction from all connected MCP servers
2. **Aggregates** results from all extraction agents
3. **Coordinates** agent execution using LangGraph
4. **Handles** errors and retries
5. **Structures** data for report generation

## Report Generation Agent

The Report Agent:
1. **Analyzes** aggregated extraction results
2. **Generates** detailed sections with evidence
3. **Creates** findings with proper citations
4. **Calculates** compliance scores
5. **Produces** executive summary

### Evidence Citations

Each finding includes:
- **Source**: MCP server name (e.g., "github", "aws-core")
- **Citation**: Formatted reference (e.g., "Source: github | Type: codebase_structure | Repository: my-repo")
- **Quote**: Relevant excerpt from the evidence
- **Metadata**: Additional context (file paths, line numbers, etc.)

## Usage Flow

1. **Connect MCP Servers**: User connects to desired MCP servers via OAuth or BYOK
2. **Start Swarm**: User clicks "Run Swarm Analysis" in dashboard
3. **Parallel Extraction**: Manager agent spawns extraction agents in parallel
4. **Data Aggregation**: Manager collects and structures all results
5. **Report Generation**: Report agent creates detailed analysis
6. **View Report**: User views comprehensive report with evidence citations

## API Endpoints

- `POST /api/swarm/run` - Start swarm analysis
- `GET /api/swarm/report?agentRunId=<id>` - Get generated report
- `GET /api/mcp/connections` - List user's MCP connections
- `POST /api/mcp/connections` - Store MCP connection (OAuth or BYOK)
- `POST /api/mcp/connect-byok` - Connect with BYOK credentials
- `DELETE /api/mcp/connections?serverName=<name>` - Delete connection

## Memory Integration

All agents use MEM0-Redis for:
- Remembering extraction patterns
- Learning from previous analyses
- Context retrieval for better analysis
- Cross-agent knowledge sharing

## Example Report Structure

```markdown
# SOC2 Compliance Report

## Executive Summary
[AI-generated summary of overall compliance posture]

## Compliance Score
Overall: 72.5/100
- Access Control: 85/100
- Data Protection: 68/100
- Monitoring: 75/100
- Business Continuity: 62/100

## Findings

### 1. Missing Multi-Factor Authentication
**Severity**: CRITICAL
**Source**: AWS Core MCP | GitHub MCP
**Evidence**: 
- AWS IAM configuration shows MFA not enforced
- GitHub repository access logs show no MFA requirement
**Recommendation**: Enable MFA for all user accounts

### 2. Unencrypted Database Backups
**Severity**: HIGH
**Source**: AWS Core MCP
**Evidence**:
- S3 bucket "backups" has encryption disabled
- RDS snapshot encryption not configured
**Recommendation**: Enable encryption for all backup storage
```

## Benefits

1. **Comprehensive Coverage**: Multiple data sources provide complete picture
2. **Parallel Processing**: Faster analysis through concurrent extraction
3. **Evidence-Based**: Every finding includes proper citations
4. **Scalable**: Easy to add new extraction agents
5. **Flexible Auth**: Supports both OAuth and BYOK per server

