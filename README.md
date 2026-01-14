# Compliance Copilot 🛡️

![Status](https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge)
![Tech](https://img.shields.io/badge/Stack-Next.js_14_|_LangGraph_|_MCP-blue?style=for-the-badge)
![AI](https://img.shields.io/badge/AI-OpenAI_GPT--5_Swarm-purple?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

> **Autonomous AI-powered compliance assessment platform.** Get audit-ready reports for SOC2, GDPR, HIPAA, ISO 27001, and PCI DSS in minutes, not months.

---

## 🚀 Live Demo

**The project is deployed and running live.**

### [👉 Launch Compliance Copilot](https://compliance-copilot-project.vercel.app/)

---

## ✨ Key Features

### 🤖 **Intelligent Multi-Agent Swarm**
- **5 Specialized AI Agents** working in parallel:
  - **Planning Agent**: Creates comprehensive assessment plans
  - **Regulation RAG Agent**: Fetches latest compliance requirements
  - **Intelligent Extraction Agent**: Autonomously scans your tech stack
  - **Gap Analysis Agent**: Identifies compliance gaps with evidence
  - **Report Generation Agent**: Creates auditor-grade reports
- **Autonomous Decision Making**: Agents decide what to scan based on framework requirements
- **Iterative Refinement**: Agents re-scan until confidence threshold is achieved

### 🔌 **Universal MCP Integration**
Connect to **14+ services** via Model Context Protocol (MCP):

| Category | Services |
|----------|----------|
| **Cloud Infrastructure** | AWS, Azure, Google Cloud, Cloudflare |
| **Code & DevOps** | GitHub, GitLab, Jenkins, ArgoCD |
| **Monitoring & Observability** | Instana, DataDog, Grafana, Sentry |
| **Communication & Collaboration** | Atlassian (JIRA, Confluence), Notion |
| **Code Quality** | SonarQube |

**Authentication Options:**
- 🔐 **OAuth 2.0** (One-click secure connection)
- 🔑 **BYOK** (Bring Your Own Key - API tokens)

### 🧠 **Agentic Memory (Mem0 + Redis)**
- **Persistent Memory**: Agents remember context between scans
- **Cross-Agent Learning**: Knowledge sharing across agent swarm
- **Reduced Hallucinations**: Context-aware responses
- **12-Hour TTL**: Automatic memory cleanup

### 🔍 **Corrective RAG Pipeline**
- **Vector Search**: Supabase pgvector for semantic search
- **Real-Time Research**: Perplexity AI, Firecrawl, Browserbase integration
- **Latest Regulations**: Always up-to-date compliance requirements
- **Evidence-Based**: Every finding includes source citations

### 📊 **Comprehensive Reporting**
- **Compliance Scores**: Overall + category breakdowns
- **Detailed Findings**: Severity ratings, evidence, recommendations
- **Remediation Plans**: Step-by-step implementation guidance
- **Multiple Formats**: PDF, Markdown, JSON exports
- **Evidence Citations**: Source, location, code snippets

### 🎯 **Flexible Analysis**
- **Framework-Specific**: SOC2, GDPR, HIPAA, ISO 27001, PCI DSS
- **Tool-Specific Scans**: Analyze just infrastructure, just code, or specific services
- **Historical Tracking**: Compare compliance scores over time
- **Real-Time Dashboard**: Live progress and agent activity

---

## 🏗️ Architecture

Compliance Copilot uses a **Multi-Agent Swarm** architecture powered by the **Model Context Protocol (MCP)** to securely access your tools, research regulations, and generate evidence-backed reports.

```mermaid
graph TD
    User[👤 User] -->|Selects Framework| Dashboard[📊 Dashboard]
    Dashboard -->|Initiates Analysis| Orchestrator[🎯 Swarm Orchestrator]
    
    subgraph "🔌 MCP Integration Layer"
        AWS[☁️ AWS]
        GH[💻 GitHub]
        Azure[☁️ Azure]
        Jira[📋 Atlassian]
        Sonar[🔍 SonarQube]
        Sentry[🚨 Sentry]
    end

    subgraph "🤖 Agent Swarm"
        Orchestrator -->|Delegates| Manager[👨‍💼 Manager Agent]
        
        Manager -->|Parallel Execution| Planning[📋 Planning Agent]
        Manager -->|Parallel Execution| Extraction[🔍 Extraction Agent]
        Manager -->|Parallel Execution| Research[🔬 Research Agent]
        Manager -->|Parallel Execution| GapAnalysis[🔎 Gap Analysis Agent]
        Manager -->|Parallel Execution| Reporting[📝 Report Agent]
        
        Extraction <-->|Fetch Data| MCP[MCP Servers]
        Research <-->|Perplexity/Firecrawl/Browserbase| Web[🌐 Web Research]
        
        Research -->|Requirements| RAG[(📚 Vector DB)]
        Extraction -->|Findings| Memory[(🧠 Mem0/Redis)]
        
        RAG & Memory --> GapAnalysis
        GapAnalysis --> Reporting
    end
    
    Reporting -->|Audit Report| Dashboard
    Dashboard -->|Download| User
```

### **Key Components**

1. **Swarm Orchestrator**: Coordinates all agents using LangGraph
2. **MCP Client Manager**: Handles connections to external services
3. **Vector Store**: Supabase pgvector for RAG (Retrieval-Augmented Generation)
4. **Agent Memory**: Redis-backed Mem0 for persistent context
5. **Research Tools**: Perplexity AI, Firecrawl, Browserbase for web research

---

## 🛠️ Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, HeroUI |
| **Backend** | Next.js API Routes, Prisma ORM |
| **Orchestration** | LangGraph, LangChain |
| **AI & LLM** | OpenAI GPT-4o, GPT-4 Turbo |
| **RAG & Vector** | Supabase pgvector, OpenAI Embeddings |
| **Integration** | Model Context Protocol (MCP) |
| **Memory** | Redis (Mem0), PostgreSQL (Prisma) |
| **Auth** | Supabase Auth (OAuth 2.0) |
| **Storage** | Supabase Storage, PostgreSQL |
| **Research Tools** | Perplexity AI, Firecrawl, Browserbase |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm/yarn
- **PostgreSQL** database (Supabase recommended)
- **Redis** instance (for agent memory)
- **Supabase** account (for database, storage, and auth)
- **OpenAI API** key (GPT-4o recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd compliance-copilot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp env.template .env
   ```
   
   Update `.env` with your credentials:
   ```env
   # Core
   DATABASE_URL="postgresql://user:password@host:5432/database"
   OPENAI_API_KEY="sk-..."
   OPENAI_CHAT_MODEL="gpt-4o"
   
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
   SUPABASE_SERVICE_ROLE_KEY="eyJ..."
   
   # Agent Memory (Redis)
   REDIS_URL="redis://localhost:6379"
   
   # Optional: Research Tools
   PERPLEXITY_API_KEY="pplx-..."  # For web research
   FIRECRAWL_API_KEY="fc-..."     # For web scraping
   BROWSERBASE_API_KEY="bb-..."   # For browser automation
   
   # MCP OAuth (Optional - for OAuth connections)
   GITHUB_CLIENT_ID="..."
   GITHUB_CLIENT_SECRET="..."
   ```

4. **Set up Redis** (for Mem0 agent memory)
   
   **Option 1: Docker (Recommended for development)**
   ```bash
   docker run -d --name redis-stack -p 6379:6379 -p 8001:8001 redis/redis-stack:latest
   ```
   
   **Option 2: Redis Cloud**
   - Sign up at [Redis Cloud](https://redis.com/try-free/)
   - Get connection URL and add to `REDIS_URL`

5. **Initialize database**
   ```bash
   # Generate Prisma Client
   npm run db:generate
   
   # Push schema (use db:push for pgvector compatibility)
   npm run db:push
   ```

6. **Set up Vector Store**
   - Open Supabase SQL Editor
   - Run the SQL from `docs/setup_vectors.sql` to enable pgvector extension

7. **Run development server**
   ```bash
   npm run dev
   ```
   
   Open [http://localhost:3000](http://localhost:3000)

---

## 📖 Usage Guide

### 1. **Connect Your Tech Stack**

Navigate to **Dashboard → MCP Connections**

**OAuth Connection** (Recommended):
- Click **"OAuth"** button for GitHub, Atlassian, or Cloudflare
- Authorize the application
- Connection established automatically

**BYOK Connection**:
- Click **"BYOK"** button
- Enter API keys/tokens
- For SSE/HTTP servers (like Instana), provide server URL
- Click **"Connect"**

**Required Connections:**
- ✅ **GitHub** (required)
- ✅ At least one **Cloud Service** (AWS, Azure, Cloudflare, or Google Cloud)

### 2. **Run Compliance Analysis**

1. Select a **compliance framework** (SOC2, GDPR, HIPAA, ISO, PCI)
2. Choose a **project** (or create new)
3. Click **"Run Swarm Analysis"**
4. Watch the magic happen:
   - 🔬 Research agents fetch latest compliance requirements
   - 🔍 Extraction agents scan your infrastructure and code
   - 📊 Gap analysis identifies compliance gaps
   - 📝 Report generation creates detailed audit report

### 3. **View Results**

- **Dashboard**: Overview of compliance scores and findings
- **Findings Tab**: Filter by severity, framework, or tool
- **Remediation Tab**: Step-by-step remediation plans
- **Reports Tab**: Download PDF, Markdown, or JSON reports

### 4. **Tool-Specific Analysis**

Run focused analysis on specific tools:
- **Infrastructure Only**: AWS, Azure, Google Cloud
- **Code Only**: GitHub repositories
- **Communication**: Atlassian (JIRA, Confluence)
- **Monitoring**: Instana, DataDog, Grafana

---

## 📚 Documentation

- **[MCP Connection Guide](docs/MCP_CONNECTION_GUIDE.md)** - Detailed guide for connecting services
- **[Agent Swarm Architecture](docs/AGENT_SWARM.md)** - Multi-agent system overview
- **[Web Research Integration](docs/AGENT_WEB_RESEARCH.md)** - Perplexity, Firecrawl, Browserbase usage
- **[Deployment Guide](DEPLOYMENT.md)** - Production deployment instructions
- **[Prisma Setup](docs/PRISMA_SETUP.md)** - Database configuration

---

## 🎯 Supported Compliance Frameworks

| Framework | Description | Key Focus Areas |
|-----------|-------------|-----------------|
| **SOC2** | Service Organization Control 2 | Security, Availability, Processing Integrity |
| **GDPR** | General Data Protection Regulation | Data Privacy, Consent Management, Right to Erasure |
| **HIPAA** | Health Insurance Portability Act | PHI Protection, Access Controls, Audit Logs |
| **ISO 27001** | Information Security Management | ISMS, Risk Management, Security Controls |
| **PCI DSS** | Payment Card Industry Data Security | Cardholder Data Protection, Network Security |

---

## 🔌 Supported Integrations

### Infrastructure
- ☁️ **AWS** (IAM, EC2, S3, RDS, Lambda, CloudWatch)
- ☁️ **Azure** (Active Directory, Storage, Compute)
- ☁️ **Google Cloud** (IAM, Compute, Storage)
- ☁️ **Cloudflare** (Workers, Pages, Security)

### Code & DevOps
- 💻 **GitHub** (Repositories, Code, Secrets, Actions)
- 🔧 **Jenkins** (Pipelines, Jobs, Builds)
- 🚀 **ArgoCD** (Applications, Deployments)

### Monitoring & Observability
- 📊 **Instana** (APM, Infrastructure Monitoring)
- 📈 **DataDog** (Metrics, Logs, APM)
- 📉 **Grafana** (Dashboards, Alerts)
- 🚨 **Sentry** (Error Tracking, Performance)

### Communication & Collaboration
- 📋 **Atlassian** (JIRA, Confluence)
- 📝 **Notion** (Pages, Databases)

### Code Quality
- 🔍 **SonarQube** (Code Quality, Security, Coverage)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **OpenAI** for GPT-4o and embeddings
- **LangChain/LangGraph** for agent orchestration
- **Model Context Protocol** for service integration
- **Supabase** for database and storage
- **Mem0** for agentic memory

---

## 📞 Support

For questions, issues, or feature requests:
- 📧 Open an issue on GitHub
- 📖 Check the [documentation](docs/)
- 🚀 Visit the [live demo](https://complaince-copilot-hackathon-projec.vercel.app/)

---

<div align="center">

**Built with ❤️ for the compliance community**

⭐ Star this repo if you find it helpful!

</div>
