/**
 * CrewAI Example Implementation
 * This shows how the 5-phase workflow could be implemented with CrewAI
 * 
 * Benefits:
 * - Native MCP integration (automatic tool discovery)
 * - Simpler agent definitions
 * - Built-in observability
 * - Less boilerplate code
 */

import { Agent, Crew, Task, Process } from 'crewai';
import { MCPTool } from '@crewai/tools';

// Example: Planning Agent with MCP tools
const planningAgent = new Agent({
  role: 'Compliance Planning Specialist',
  goal: 'Create a comprehensive compliance assessment plan based on available MCP connections and selected framework',
  backstory: `You are an expert compliance consultant specializing in ${framework} assessments.
    You analyze available infrastructure and codebase connections to create detailed assessment plans.`,
  tools: [
    // MCP tools are automatically discovered and registered
    new MCPTool({
      server: 'github',
      tool: 'list_repositories', // or whatever tool name is available
    }),
    new MCPTool({
      server: 'aws-core',
      tool: 'prompt_understanding',
    }),
  ],
  verbose: true,
  allow_delegation: false,
});

// Example: Extraction Agent
const extractionAgent = new Agent({
  role: 'Data Extraction Specialist',
  goal: 'Extract comprehensive data from all connected MCP services',
  backstory: 'You specialize in extracting infrastructure, codebase, and monitoring data from various sources.',
  tools: [
    new MCPTool({ server: 'github', tool: 'get_file_contents' }),
    new MCPTool({ server: 'aws-core', tool: 'list_resources' }),
    new MCPTool({ server: 'sentry', tool: 'get_errors' }),
    new MCPTool({ server: 'sonarqube', tool: 'get_metrics' }),
  ],
  verbose: true,
});

// Example: Analysis Agent
const analysisAgent = new Agent({
  role: 'Compliance Analysis Specialist',
  goal: 'Analyze extracted data against compliance requirements',
  backstory: 'You are an expert at identifying compliance gaps and security issues.',
  tools: [
    new MCPTool({ server: 'firecrawl', tool: 'scrape' }),
    new MCPTool({ server: 'perplexity', tool: 'search' }),
  ],
  verbose: true,
});

// Example: Report Generation Agent
const reportAgent = new Agent({
  role: 'Technical Writer',
  goal: 'Generate comprehensive compliance reports with evidence citations',
  backstory: 'You create detailed, professional compliance reports for technical audiences.',
  verbose: true,
});

// Tasks
const planningTask = new Task({
  description: `Create a detailed ${framework} compliance assessment plan.
    Consider available MCP connections: ${availableConnections.join(', ')}.
    The plan should include:
    1. Assessment scope
    2. Key compliance areas to evaluate
    3. Data sources to analyze
    4. Expected deliverables`,
  agent: planningAgent,
  expected_output: 'A structured assessment plan in JSON format',
});

const extractionTask = new Task({
  description: `Extract data from all connected MCP services:
    - GitHub: Repository structure, code files, dependencies
    - AWS: Infrastructure configuration, services, databases
    - Sentry: Error logs, performance metrics
    - SonarQube: Code quality metrics, vulnerabilities`,
  agent: extractionAgent,
  expected_output: 'Structured extraction results with evidence',
});

const analysisTask = new Task({
  description: `Analyze extracted data against ${framework} requirements.
    Use research tools to gather latest compliance standards.
    Identify gaps and security issues.`,
  agent: analysisAgent,
  expected_output: 'Gap analysis with findings and evidence',
});

const reportTask = new Task({
  description: `Generate a comprehensive compliance report including:
    - Executive summary
    - Detailed findings with evidence
    - Compliance scores
    - Remediation recommendations`,
  agent: reportAgent,
  expected_output: 'Complete compliance report in markdown format',
});

// Crew with sequential process (matches our 5-phase workflow)
const complianceCrew = new Crew({
  agents: [planningAgent, extractionAgent, analysisAgent, reportAgent],
  tasks: [planningTask, extractionTask, analysisTask, reportTask],
  process: Process.sequential, // Ensures tasks run in order
  verbose: true,
  // Built-in callbacks for progress tracking
  step_callback: (step) => {
    console.log(`Step: ${step.agent} - ${step.description}`);
    // Can integrate with your onUpdate callback here
  },
});

// Usage
export async function runCrewAIWorkflow(
  framework: string,
  availableConnections: string[],
  onUpdate?: (step: any) => void
) {
  const result = await complianceCrew.kickoff({
    framework,
    availableConnections: availableConnections.join(', '),
  });

  return result;
}

/**
 * Comparison with Current LangGraph Implementation:
 * 
 * Current (LangGraph):
 * - ~1300 lines of code
 * - Manual state management
 * - Complex conditional routing
 * - Manual MCP tool integration
 * 
 * CrewAI:
 * - ~150 lines of code
 * - Automatic state management
 * - Built-in sequential/hierarchical processes
 * - Native MCP tool integration
 * - Built-in observability
 */

