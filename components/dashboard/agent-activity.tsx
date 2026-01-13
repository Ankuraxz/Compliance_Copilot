'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/react';
import { Chip, Progress } from '@heroui/react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Code, 
  Database, 
  Cloud, 
  Search,
  FileText,
  Zap,
  Shield,
  GitBranch,
  Bug,
  AlertTriangle
} from 'lucide-react';

export interface AgentActivity {
  id: string;
  timestamp: Date;
  agent: string;
  step: string;
  status: 'running' | 'completed' | 'failed';
  toolCalls?: Array<{
    tool: string;
    server: string;
    status: 'pending' | 'success' | 'error';
    duration?: number;
    error?: string;
  }>;
  data?: any;
  error?: string;
}

interface AgentActivityMonitorProps {
  agentRunId: string | null;
}

interface AgentState {
  name: string;
  displayName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: string;
  progress: number;
  toolCalls: number;
  successfulToolCalls: number;
  error?: string;
  lastUpdate: Date;
  logs: Array<{
    timestamp: Date;
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    details?: any;
  }>;
  phase?: string; // Phase number for 5-phase workflow
}

const getAgentDisplayName = (agentName: string): string => {
  const names: Record<string, string> = {
    'swarm-manager': 'Swarm Manager',
    'phase1_planning': 'Phase 1: Planning',
    'planning-agent': 'Phase 1: Planning',
    'extract_aws': 'Phase 2: AWS Extraction',
    'extract_github': 'Phase 2: GitHub Extraction',
    'extract_sonarqube': 'Phase 2: SonarQube Extraction',
    'extract_sentry': 'Phase 2: Sentry Extraction',
    'extract_atlassian': 'Phase 2: Atlassian Extraction',
    'aggregate_extraction': 'Phase 2: Aggregation',
    'phase2_intelligent_extraction': 'Phase 2: Intelligent Extraction',
    'intelligent-extraction': 'Phase 2: Intelligent Extraction',
    'phase3_analysis': 'Phase 3: Analysis & Research',
    'analysis-research-agent': 'Phase 3: Analysis & Research',
    'phase4_report': 'Phase 4: Report Generation',
    'report-generator': 'Phase 4: Report Generation',
    'phase5_comparison': 'Phase 5: Comparison & Decision',
    'comparison-agent': 'Phase 5: Comparison & Decision',
    'aws-extraction': 'AWS Extraction',
    'github-extraction': 'GitHub Extraction',
    'sonarqube-extraction': 'SonarQube Extraction',
    'sentry-extraction': 'Sentry Extraction',
    'atlassian-extraction': 'Atlassian Extraction',
    'analysis-extraction': 'Research & Analysis',
  };
  return names[agentName] || agentName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const getPhaseFromAgent = (agentName: string): string | undefined => {
  if (agentName.includes('phase1') || agentName.includes('planning')) return 'Phase 1';
  if (agentName.includes('phase2') || agentName.includes('extract_') || agentName.includes('aggregate') || agentName.includes('intelligent')) return 'Phase 2';
  if (agentName.includes('phase3') || agentName.includes('analysis') || agentName.includes('gap') || agentName.includes('remediation')) return 'Phase 3';
  if (agentName.includes('phase4') || agentName.includes('report')) return 'Phase 4';
  if (agentName.includes('phase5') || agentName.includes('comparison')) return 'Phase 5';
  return undefined;
};

export function AgentActivityMonitor({ agentRunId }: AgentActivityMonitorProps) {
  const [agentStates, setAgentStates] = useState<Map<string, AgentState>>(new Map());
  const [overallStatus, setOverallStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending');
  const [stats, setStats] = useState({
    totalAgents: 0,
    activeAgents: 0,
    completedAgents: 0,
    failedAgents: 0,
    totalToolCalls: 0,
    successfulToolCalls: 0,
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!agentRunId) {
      setOverallStatus('pending');
      setAgentStates(new Map());
      setStats({
        totalAgents: 0,
        activeAgents: 0,
        completedAgents: 0,
        failedAgents: 0,
        totalToolCalls: 0,
        successfulToolCalls: 0,
      });
      return;
    }

    // Reset state for new run
    setOverallStatus('running');
    setAgentStates(new Map());
    setStats({
      totalAgents: 0,
      activeAgents: 0,
      completedAgents: 0,
      failedAgents: 0,
      totalToolCalls: 0,
      successfulToolCalls: 0,
    });

    // Connect to Server-Sent Events for real-time updates
    const eventSource = new EventSource(`/api/swarm/stream?agentRunId=${agentRunId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'step') {
          const agentName = data.agent || 'swarm-manager';
          setOverallStatus(data.status || 'running');
          
          // Update or create agent state
          setAgentStates((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(agentName) || {
              name: agentName,
              displayName: getAgentDisplayName(agentName),
              status: 'pending' as const,
              currentStep: '',
              progress: 0,
              toolCalls: 0,
              successfulToolCalls: 0,
              lastUpdate: new Date(),
            };

            // Add log entry
            const hasErrors = data.data?.errors > 0 || data.error;
            const logLevel = data.status === 'completed' ? 'success' as const : 
                           data.status === 'failed' ? 'error' as const :
                           hasErrors ? 'error' as const : 'info' as const;
            
            const newLog = {
              timestamp: new Date(),
              level: logLevel,
              message: data.step || existing.currentStep || 'Processing...',
              details: data.data || (data.error ? { error: data.error, errorsList: data.data?.errorsList } : undefined),
            };

            // Determine status - if there are errors, mark as failed
            // CRITICAL: Default to 'running' if status is not explicitly set
            let agentStatus: 'pending' | 'running' | 'completed' | 'failed' = 
              data.status || existing.status || 'running';
            
            // If status is explicitly provided, use it
            if (data.status && ['pending', 'running', 'completed', 'failed'].includes(data.status)) {
              agentStatus = data.status as any;
            }
            
            // Override to failed if there are errors
            if (data.data?.errors > 0 || data.error) {
              agentStatus = 'failed';
            }
            
            // If no status is set and agent is new, default to running
            if (!existing.status && !data.status) {
              agentStatus = 'running';
            }

            // Calculate progress based on step content if it contains progress indicators
            let calculatedProgress = existing.progress;
            const stepText = (data.step || existing.currentStep || '').toLowerCase();
            
            // Try to extract progress from step message (e.g., "5/10 tasks, 3/5 tools")
            const taskMatch = stepText.match(/(\d+)\/(\d+)\s*tasks?/);
            const toolMatch = stepText.match(/(\d+)\/(\d+)\s*tools?/);
            
            if (taskMatch && toolMatch) {
              const currentTasks = parseInt(taskMatch[1]);
              const totalTasks = parseInt(taskMatch[2]);
              const currentTools = parseInt(toolMatch[1]);
              const totalTools = parseInt(toolMatch[2]);
              
              // Weighted progress: 60% tasks, 40% tools
              const taskProgress = totalTasks > 0 ? (currentTasks / totalTasks) * 60 : 0;
              const toolProgress = totalTools > 0 ? (currentTools / totalTools) * 40 : 0;
              calculatedProgress = Math.min(Math.round(taskProgress + toolProgress), 95);
            } else if (taskMatch) {
              const currentTasks = parseInt(taskMatch[1]);
              const totalTasks = parseInt(taskMatch[2]);
              calculatedProgress = totalTasks > 0 ? Math.min(Math.round((currentTasks / totalTasks) * 90), 95) : existing.progress;
            } else if (toolMatch) {
              const currentTools = parseInt(toolMatch[1]);
              const totalTools = parseInt(toolMatch[2]);
              calculatedProgress = totalTools > 0 ? Math.min(Math.round((currentTools / totalTools) * 90), 95) : existing.progress;
            } else if (stepText.includes('completed') || stepText.includes('finished')) {
              calculatedProgress = 100;
            } else if (stepText.includes('failed') || stepText.includes('error')) {
              calculatedProgress = Math.max(existing.progress, 0);
            } else if (agentStatus === 'running') {
              // Increment progress slowly if no specific indicators found
              calculatedProgress = Math.min(existing.progress + 2, 90);
            }
            
            const newState: AgentState = {
              ...existing,
              status: agentStatus as any,
              currentStep: data.step || existing.currentStep,
              progress: calculatedProgress,
              lastUpdate: new Date(),
              error: data.error || (data.data?.errorsList && data.data.errorsList.length > 0 ? data.data.errorsList[data.data.errorsList.length - 1] : undefined),
              logs: [...((existing as AgentState).logs || []), newLog],
              phase: getPhaseFromAgent(agentName),
            };

            // Update tool calls
            if (data.toolCalls && Array.isArray(data.toolCalls)) {
              newState.toolCalls += data.toolCalls.length;
              newState.successfulToolCalls += data.toolCalls.filter((tc: any) => tc.status === 'success').length;
            }

            newMap.set(agentName, newState);
            
            // Recalculate stats from updated agent states
            const statesArray = Array.from(newMap.values());
            const activeCount = statesArray.filter(s => s.status === 'running').length;
            const completedCount = statesArray.filter(s => s.status === 'completed').length;
            const failedCount = statesArray.filter(s => s.status === 'failed').length;
            const totalCount = statesArray.length;

            // Update tool calls stats
            const totalToolCalls = statesArray.reduce((sum, s) => sum + s.toolCalls, 0);
            const successfulToolCalls = statesArray.reduce((sum, s) => sum + s.successfulToolCalls, 0);

            setStats({
              activeAgents: activeCount,
              completedAgents: completedCount,
              failedAgents: failedCount,
              totalAgents: totalCount,
              totalToolCalls,
              successfulToolCalls,
            });

            return newMap;
          });
        } else if (data.type === 'complete') {
          setOverallStatus('completed');
          // Mark all running agents as completed
          setAgentStates((prev) => {
            const newMap = new Map(prev);
            prev.forEach((state, key) => {
              if (state.status === 'running') {
                newMap.set(key, { ...state, status: 'completed', progress: 100 });
              }
            });
            return newMap;
          });
          eventSource.close();
        } else if (data.type === 'error') {
          setOverallStatus('failed');
          setAgentStates((prev) => {
            const newMap = new Map(prev);
            const manager = newMap.get('swarm-manager') || {
              name: 'swarm-manager',
              displayName: 'Swarm Manager',
              status: 'failed' as const,
              currentStep: '',
              progress: 0,
              toolCalls: 0,
              successfulToolCalls: 0,
              lastUpdate: new Date(),
              logs: [],
              phase: undefined,
            };
            newMap.set('swarm-manager', {
              ...manager,
              status: 'failed',
              currentStep: 'Error occurred',
              error: data.error,
            });
            return newMap;
          });
          eventSource.close();
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      setOverallStatus('failed');
      setTimeout(() => {
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close();
        }
      }, 5000);
    };

    return () => {
      eventSource.close();
    };
  }, [agentRunId]);

  const getAgentIcon = (agentName: string) => {
    if (agentName.includes('aws') || agentName.includes('cloud')) {
      return <Cloud className="w-5 h-5" />;
    }
    if (agentName.includes('github') || agentName.includes('code')) {
      return <GitBranch className="w-5 h-5" />;
    }
    if (agentName.includes('sonarqube') || agentName.includes('quality')) {
      return <Code className="w-5 h-5" />;
    }
    if (agentName.includes('sentry') || agentName.includes('monitoring')) {
      return <Bug className="w-5 h-5" />;
    }
    if (agentName.includes('atlassian') || agentName.includes('jira')) {
      return <FileText className="w-5 h-5" />;
    }
    if (agentName.includes('analysis') || agentName.includes('research') || agentName.includes('firecrawl') || agentName.includes('perplexity')) {
      return <Search className="w-5 h-5" />;
    }
    if (agentName.includes('report') || agentName.includes('generator')) {
      return <Shield className="w-5 h-5" />;
    }
    if (agentName.includes('manager') || agentName.includes('swarm')) {
      return <Zap className="w-5 h-5" />;
    }
    return <Activity className="w-5 h-5" />;
  };

  const getStatusColor = (status: string): 'default' | 'primary' | 'success' | 'danger' | 'warning' => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'danger';
      case 'running':
        return 'primary';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const agentArray = Array.from(agentStates.values());
  const runningAgents = agentArray.filter(a => a.status === 'running');
  const completedAgents = agentArray.filter(a => a.status === 'completed');
  const failedAgents = agentArray.filter(a => a.status === 'failed');
  const pendingAgents = agentArray.filter(a => a.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border border-default-200 dark:border-default-100 shadow-sm">
          <CardBody className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-default-500">Overall Status</p>
                <p className="text-2xl font-bold capitalize">{overallStatus}</p>
              </div>
              {overallStatus === 'running' && (
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              )}
              {overallStatus === 'completed' && (
                <CheckCircle2 className="w-8 h-8 text-success" />
              )}
              {overallStatus === 'failed' && (
                <XCircle className="w-8 h-8 text-danger" />
              )}
              {overallStatus === 'pending' && (
                <Activity className="w-8 h-8 text-default-400" />
              )}
            </div>
          </CardBody>
        </Card>

        <Card className="border border-default-200 dark:border-default-100 shadow-sm">
          <CardBody className="pt-6">
            <div>
              <p className="text-sm font-medium text-default-500">Active Agents</p>
              <p className="text-2xl font-bold text-primary">{stats.activeAgents}</p>
              <p className="text-xs text-default-400 mt-1">
                {stats.completedAgents} completed, {stats.failedAgents} failed
              </p>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-default-200 dark:border-default-100 shadow-sm">
          <CardBody className="pt-6">
            <div>
              <p className="text-sm font-medium text-default-500">Tool Calls</p>
              <p className="text-2xl font-bold">
                {stats.successfulToolCalls}/{stats.totalToolCalls}
              </p>
              <p className="text-xs text-default-400 mt-1">Successful calls</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-default-200 dark:border-default-100 shadow-sm">
          <CardBody className="pt-6">
            <div>
              <p className="text-sm font-medium text-default-500">Total Agents</p>
              <p className="text-2xl font-bold">{agentArray.length}</p>
              <p className="text-xs text-default-400 mt-1">In this run</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Agent Tiles */}
      {!agentRunId ? (
        <Card className="border border-default-200 dark:border-default-100 shadow-sm">
          <CardBody className="py-12 text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-default-400" />
            <p className="font-semibold text-lg mb-2 text-default-700">No active swarm analysis</p>
            <p className="text-sm text-default-500">Click "Run Swarm Analysis" to start monitoring agent activity</p>
          </CardBody>
        </Card>
      ) : agentArray.length === 0 ? (
        <Card className="border border-default-200 dark:border-default-100 shadow-sm">
          <CardBody className="py-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
            <p className="text-default-600">Connecting to activity stream...</p>
            <p className="text-xs text-default-400 mt-2">Waiting for agent activity...</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Running Agents */}
          {runningAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-default-600 dark:text-default-400 mb-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Active Agents ({runningAgents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {runningAgents.map((agent) => (
                  <AgentTile 
                    key={agent.name} 
                    agent={agent}
                    getAgentIcon={getAgentIcon}
                    getStatusColor={getStatusColor}
                    getStatusIcon={getStatusIcon}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Agents */}
          {completedAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-default-600 dark:text-default-400 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                Completed ({completedAgents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedAgents.map((agent) => (
                  <AgentTile 
                    key={agent.name} 
                    agent={agent}
                    getAgentIcon={getAgentIcon}
                    getStatusColor={getStatusColor}
                    getStatusIcon={getStatusIcon}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Failed Agents */}
          {failedAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-default-600 dark:text-default-400 mb-3 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-danger" />
                Failed ({failedAgents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {failedAgents.map((agent) => (
                  <AgentTile 
                    key={agent.name} 
                    agent={agent}
                    getAgentIcon={getAgentIcon}
                    getStatusColor={getStatusColor}
                    getStatusIcon={getStatusIcon}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pending Agents */}
          {pendingAgents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-default-600 dark:text-default-400 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-default-400" />
                Pending ({pendingAgents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingAgents.map((agent) => (
                  <AgentTile 
                    key={agent.name} 
                    agent={agent}
                    getAgentIcon={getAgentIcon}
                    getStatusColor={getStatusColor}
                    getStatusIcon={getStatusIcon}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentTile({ agent, getAgentIcon, getStatusColor, getStatusIcon }: { 
  agent: AgentState;
  getAgentIcon: (name: string) => JSX.Element;
  getStatusColor: (status: string) => 'default' | 'primary' | 'success' | 'danger' | 'warning';
  getStatusIcon: (status: string) => JSX.Element;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const icon = getAgentIcon(agent.name);
  const statusColor = getStatusColor(agent.status);
  const statusIcon = getStatusIcon(agent.status);

  return (
    <Card className={`border border-default-200 dark:border-default-100 shadow-sm hover:shadow-md transition-shadow ${
      agent.status === 'running' ? 'ring-2 ring-primary/20' : ''
    }`}>
      <CardBody className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              agent.status === 'running' ? 'bg-primary/10 text-primary' :
              agent.status === 'completed' ? 'bg-success/10 text-success' :
              agent.status === 'failed' ? 'bg-danger/10 text-danger' :
              'bg-default/10 text-default-500'
            }`}>
              {icon}
            </div>
            <div className="flex-1">
              {agent.phase && (
                <Chip size="sm" variant="flat" color="secondary" className="mb-1 text-xs">
                  {agent.phase}
                </Chip>
              )}
              <h4 className="font-semibold text-sm">{agent.displayName}</h4>
              <Chip
                size="sm"
                color={statusColor}
                variant="flat"
                startContent={statusIcon}
                className="mt-1"
              >
                {agent.status}
              </Chip>
            </div>
          </div>
        </div>

        {agent.status === 'running' && (
          <Progress
            value={agent.progress}
            color="primary"
            size="sm"
            className="mb-3"
            aria-label={`${agent.displayName} progress`}
          />
        )}

        <p className="text-xs text-default-600 dark:text-default-400 line-clamp-2 mb-2">
          {agent.currentStep || 'Waiting...'}
        </p>

        {agent.toolCalls > 0 && (
          <div className="flex items-center gap-2 text-xs text-default-500 mt-2 pt-2 border-t border-default-100">
            <Code className="w-3 h-3" />
            <span>{agent.successfulToolCalls}/{agent.toolCalls} tools</span>
          </div>
        )}

        {agent.error && (
          <div className="mt-2 p-2 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded text-xs text-danger-700 dark:text-danger-400">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            {agent.error}
          </div>
        )}

        {/* Expandable Logs Section */}
        {agent.logs && agent.logs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-default-100">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center justify-between w-full text-xs text-default-500 hover:text-default-700 dark:hover:text-default-300 transition-colors"
            >
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                View Logs ({agent.logs.length})
              </span>
              <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>
            
            {isExpanded && (
              <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                {agent.logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`text-xs p-2 rounded border-l-2 ${
                      log.level === 'error' ? 'bg-danger-50 dark:bg-danger-900/20 border-danger-500 text-danger-700 dark:text-danger-400' :
                      log.level === 'success' ? 'bg-success-50 dark:bg-success-900/20 border-success-500 text-success-700 dark:text-success-400' :
                      log.level === 'warning' ? 'bg-warning-50 dark:bg-warning-900/20 border-warning-500 text-warning-700 dark:text-warning-400' :
                      'bg-default-50 dark:bg-default-900/20 border-default-300 text-default-700 dark:text-default-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-mono text-[10px] text-default-400 mb-1">
                          {log.timestamp.toLocaleTimeString()}
                        </div>
                        <div className="font-medium">{log.message}</div>
                        {log.details && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-default-500 hover:text-default-700 text-[10px]">
                              Details
                            </summary>
                            <pre className="mt-1 text-[10px] overflow-x-auto bg-default-100 dark:bg-default-800 p-2 rounded">
                              {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-default-400 mt-2">
          Updated {agent.lastUpdate.toLocaleTimeString()}
        </p>
      </CardBody>
    </Card>
  );
}

