'use client';

import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/react';
import { Tabs, Tab } from '@heroui/react';
import { Select, SelectItem } from '@heroui/react';
import { Chip } from '@heroui/react';
import { ComplianceRadialChart } from '@/components/dashboard/compliance-radial-chart';
import { GapFeed } from '@/components/dashboard/gap-feed';
import { EvidenceInspector } from '@/components/dashboard/evidence-inspector';
import { MCPConnectionManager } from '@/components/mcp/connection-manager';
import { SwarmReport } from '@/components/dashboard/swarm-report';
import { AgentActivityMonitor } from '@/components/dashboard/agent-activity';
import { Button } from '@heroui/react';
import { UserMenu } from '@/components/dashboard/user-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { 
  Play, Loader2, Shield, TrendingUp, AlertTriangle, Plus, FileText, Calendar
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string;
  repoUrl?: string;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<string>('SOC2');
  const [isRunning, setIsRunning] = useState(false);
  const [swarmRunId, setSwarmRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  
  // Toast notifications
  const toast = useToast();
  const showToast = toast.showToast;

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch('/api/projects', {
        signal: controller.signal,
        cache: 'no-store', // Ensure fresh data
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`);
      }

      const data = await response.json();
      setProjects(data.projects || []);
      
      // Auto-select first project or create default
      if (data.projects && data.projects.length > 0) {
        setSelectedProject(data.projects[0].id);
      } else {
        // Create default project (don't block UI)
        createDefaultProject().catch(err => {
          console.error('Error creating default project:', err);
        });
      }
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      if (error.name === 'AbortError') {
        setError('Request timed out. Please check your connection and try again.');
        showToast('Project loading timed out', 'error');
      } else {
        setError('Failed to load projects. Please refresh the page.');
        showToast('Failed to load projects', 'error');
      }
    } finally {
      setLoadingProjects(false);
    }
  };

  const createDefaultProject = async () => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Default Project',
          description: 'Default compliance assessment project',
        }),
      });
      const data = await response.json();
      if (data.success && data.project) {
        setProjects([data.project]);
        setSelectedProject(data.project.id);
      }
    } catch (error: any) {
      console.error('Error creating default project:', error);
      showToast('Failed to create default project', 'error');
    }
  };

  const createNewProject = async () => {
    if (!newProjectName.trim()) {
      showToast('Project name is required', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDescription || undefined,
        }),
      });
      const data = await response.json();
      if (data.success && data.project) {
        setProjects([...projects, data.project]);
        setSelectedProject(data.project.id);
        setShowNewProjectModal(false);
        setNewProjectName('');
        setNewProjectDescription('');
        showToast('Project created successfully', 'success');
      } else {
        showToast(`Failed to create project: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (error: any) {
      console.error('Error creating project:', error);
      showToast(`Error creating project: ${error.message || 'Unknown error'}`, 'error');
    }
  };

  const fetchReports = async () => {
    if (!selectedProject) return;
    
    setLoadingReports(true);
    try {
      const response = await fetch(`/api/reports?projectId=${selectedProject}`);
      if (!response.ok) {
        if (response.status === 401) {
          console.warn('Auth error fetching reports - user may need to re-login');
          showToast('Authentication required. Please refresh the page.', 'warning');
        } else {
          console.error('Failed to fetch reports:', response.status, response.statusText);
          showToast('Failed to load reports', 'error');
        }
        setReports([]);
        return;
      }
      const data = await response.json();
      setReports(data.reports || []);
      if (data.reports && data.reports.length > 0) {
        console.log(`Loaded ${data.reports.length} report(s) for project ${selectedProject}`);
      }
    } catch (error: any) {
      console.error('Error fetching reports:', error);
      showToast('Error loading reports', 'error');
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    if (selectedProject && activeTab === 'reports') {
      fetchReports();
    }
  }, [selectedProject, activeTab]);

  const fetchDashboardStats = async () => {
    if (!selectedProject) return;
    
    setLoadingStats(true);
    try {
      const response = await fetch(`/api/dashboard/stats?projectId=${selectedProject}&framework=${selectedFramework}`);
      if (!response.ok) {
        console.error('Failed to fetch dashboard stats:', response.status);
        return;
      }
      const data = await response.json();
      setDashboardStats(data.stats);
    } catch (error: any) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (selectedProject && activeTab === 'overview') {
      fetchDashboardStats();
    }
  }, [selectedProject, selectedFramework, activeTab]);

  // Auto-refresh stats every 30 seconds when on overview tab
  useEffect(() => {
    if (selectedProject && activeTab === 'overview' && !loadingStats) {
      const interval = setInterval(() => {
        fetchDashboardStats();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [selectedProject, activeTab, loadingStats]);

  if (error && !loadingProjects) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4 border-danger-200 dark:border-danger-800">
          <CardHeader className="bg-danger-50 dark:bg-danger-900/20">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-danger" />
              <h3 className="text-lg font-bold text-danger">Error</h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-default-600 dark:text-default-400">{error}</p>
            <Button color="primary" onPress={() => window.location.reload()}>
              Reload Page
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Minimal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Compliance Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              color="primary"
              onPress={async () => {
                // Check connections before running
                try {
                  const connectionsResponse = await fetch('/api/mcp/connections');
                  const connectionsData = await connectionsResponse.json();
                  const connections = connectionsData.connections || [];
                  
                  const isGitHubConnected = connections.some((c: any) => c.serverName === 'github' && c.isActive);
                  const cloudServers = ['aws-core', 'azure', 'cloudflare', 'gcloud'];
                  const isCloudServiceConnected = connections.some((c: any) => 
                    cloudServers.includes(c.serverName) && c.isActive
                  );
                  
                  if (!isGitHubConnected || !isCloudServiceConnected) {
                    showToast('Please connect GitHub and at least one cloud service in MCP Connections tab before running analysis.', 'warning');
                    setActiveTab('connections');
                    return;
                  }
                } catch (error) {
                  console.error('Error checking connections:', error);
                }

                setIsRunning(true);
                try {
                  const response = await fetch('/api/swarm/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      projectId: selectedProject,
                      framework: selectedFramework,
                    }),
                  });
                  const data = await response.json();
                  if (data.success) {
                    setSwarmRunId(data.agentRunId);
                    setActiveTab('swarm');
                    showToast('Swarm analysis started successfully', 'success');
                    // Refresh dashboard stats after starting analysis
                    if (activeTab === 'overview') {
                      setTimeout(() => fetchDashboardStats(), 2000);
                    }
                  } else {
                    showToast(`Failed to start swarm: ${data.error || 'Unknown error'}`, 'error');
                  }
                } catch (error: any) {
                  console.error('Error starting swarm:', error);
                  showToast(`Error starting swarm: ${error.message || 'Unknown error'}`, 'error');
                } finally {
                  setIsRunning(false);
                }
              }}
              isDisabled={isRunning || !selectedProject}
              startContent={isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            >
              {isRunning ? 'Running...' : 'Run Analysis'}
            </Button>
            <UserMenu />
          </div>
        </div>

        {/* Project and Framework Selector */}
        <div className="flex flex-wrap gap-4 items-center p-4 bg-content1 rounded-lg border border-default-200 dark:border-default-100">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-default-600 dark:text-default-400">Project:</span>
            {loadingProjects ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs text-default-500">Loading projects...</span>
              </div>
            ) : projects.length > 0 ? (
              <>
                <Select
                  selectedKeys={selectedProject ? [selectedProject] : []}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as string;
                    setSelectedProject(selected);
                  }}
                  size="sm"
                  className="min-w-[200px]"
                  variant="bordered"
                >
                  {projects.map((project) => (
                    <SelectItem key={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </Select>
                <Button
                  variant="bordered"
                  size="sm"
                  onPress={() => setShowNewProjectModal(true)}
                  startContent={<Plus className="w-4 h-4" />}
                >
                  New Project
                </Button>
              </>
            ) : (
              <Button
                variant="bordered"
                size="sm"
                onPress={createDefaultProject}
              >
                Create Project
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-default-600 dark:text-default-400">Framework:</span>
            <div className="flex gap-2">
              {['SOC2', 'GDPR', 'HIPAA', 'ISO', 'PCI'].map((framework) => (
                <Chip
                  key={framework}
                  color={selectedFramework === framework ? 'primary' : 'default'}
                  variant={selectedFramework === framework ? 'solid' : 'flat'}
                  className="cursor-pointer transition-all hover:scale-105"
                  onClick={() => setSelectedFramework(framework)}
                >
                  {framework}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <Tabs 
            selectedKey={activeTab} 
            onSelectionChange={(key) => setActiveTab(key as string)}
            className="w-full"
            classNames={{
              base: "w-full",
              tabList: "gap-2 w-full relative rounded-lg p-1 bg-content1/80 backdrop-blur-sm border border-default-200 dark:border-default-100 shadow-lg",
              cursor: "w-full bg-primary-100 dark:bg-primary-900",
              tab: "max-w-fit px-4 h-10",
              tabContent: "group-data-[selected=true]:text-primary-600 dark:group-data-[selected=true]:text-primary-400"
            }}
          >
          <Tab key="overview" title="Overview">
            {loadingStats ? (
              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2 shadow-lg border border-default-200 dark:border-default-100">
                    <CardBody className="py-12">
                      <CardSkeleton />
                    </CardBody>
                  </Card>
                  <Card className="shadow-lg border border-default-200 dark:border-default-100">
                    <CardBody className="py-12">
                      <CardSkeleton />
                    </CardBody>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="space-y-6 mt-6">
                {/* Overall Status Tiles */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="shadow-lg border border-default-200 dark:border-default-100">
                    <CardBody className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-default-500">Overall Status</p>
                          <p className="text-2xl font-bold capitalize">
                            {dashboardStats?.overallStatus || 'pending'}
                          </p>
                        </div>
                        {dashboardStats?.overallStatus === 'running' && (
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        )}
                        {dashboardStats?.overallStatus === 'completed' && (
                          <Shield className="w-8 h-8 text-success" />
                        )}
                        {dashboardStats?.overallStatus === 'failed' && (
                          <AlertTriangle className="w-8 h-8 text-danger" />
                        )}
                        {(!dashboardStats?.overallStatus || dashboardStats?.overallStatus === 'pending') && (
                          <Shield className="w-8 h-8 text-default-400" />
                        )}
                      </div>
                    </CardBody>
                  </Card>

                  <Card className="shadow-lg border border-default-200 dark:border-default-100">
                    <CardBody className="pt-6">
                      <div>
                        <p className="text-sm font-medium text-default-500">Compliance Score</p>
                        <p className="text-2xl font-bold" style={{
                          color: dashboardStats?.latestReport?.score !== null && dashboardStats?.latestReport?.score !== undefined
                            ? (dashboardStats.latestReport.score >= 80 ? '#10b981' :
                               dashboardStats.latestReport.score >= 60 ? '#f59e0b' : '#ef4444')
                            : '#6b7280'
                        }}>
                          {dashboardStats?.latestReport?.score !== null && dashboardStats?.latestReport?.score !== undefined
                            ? `${dashboardStats.latestReport.score.toFixed(1)}%`
                            : '--'}
                        </p>
                        {dashboardStats?.latestReport && (
                          <p className="text-xs text-default-400 mt-1">
                            {new Date(dashboardStats.latestReport.createdAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </CardBody>
                  </Card>

                  <Card className="shadow-lg border border-default-200 dark:border-default-100">
                    <CardBody className="pt-6">
                      <div>
                        <p className="text-sm font-medium text-default-500">Total Findings</p>
                        <p className="text-2xl font-bold text-default-900 dark:text-default-100">
                          {dashboardStats?.findings?.total ?? 0}
                        </p>
                        <p className="text-xs text-default-400 mt-1">
                          {dashboardStats?.findings?.critical ?? 0} critical, {dashboardStats?.findings?.high ?? 0} high
                        </p>
                      </div>
                    </CardBody>
                  </Card>

                  <Card className="shadow-lg border border-default-200 dark:border-default-100">
                    <CardBody className="pt-6">
                      <div>
                        <p className="text-sm font-medium text-default-500">Remediation Tasks</p>
                        <p className="text-2xl font-bold text-default-900 dark:text-default-100">
                          {dashboardStats?.remediationTasks ?? 0}
                        </p>
                        <p className="text-xs text-default-400 mt-1">Pending resolution</p>
                      </div>
                    </CardBody>
                  </Card>
                </div>

                {/* Detailed Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Compliance Scores */}
                  <ErrorBoundary>
                    <Card className="lg:col-span-2 shadow-lg border border-default-200 dark:border-default-100">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            <h3 className="text-xl font-bold">Compliance Scores</h3>
                          </div>
                          {dashboardStats?.overallStatus && (
                            <Chip
                              color={
                                dashboardStats.overallStatus === 'completed' ? 'success' :
                                dashboardStats.overallStatus === 'running' ? 'primary' :
                                dashboardStats.overallStatus === 'failed' ? 'danger' : 'default'
                              }
                              variant="flat"
                              size="sm"
                            >
                              {dashboardStats.overallStatus}
                            </Chip>
                          )}
                        </div>
                        <p className="text-sm text-default-500 mt-1">
                          {dashboardStats?.latestReport 
                            ? `Last updated: ${new Date(dashboardStats.latestReport.createdAt).toLocaleDateString()}`
                            : 'Overall compliance status by framework'}
                        </p>
                      </CardHeader>
                      <CardBody>
                        <ComplianceRadialChart 
                          framework={selectedFramework}
                          reportData={dashboardStats?.latestReport ? {
                            overallScore: dashboardStats.overallScore,
                            byCategory: dashboardStats.complianceScores,
                          } : null}
                        />
                      </CardBody>
                    </Card>
                  </ErrorBoundary>

                  {/* Quick Stats */}
                  <Card className="shadow-lg border border-default-200 dark:border-default-100">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        <h3 className="text-xl font-bold">Quick Stats</h3>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-6">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-default-500">Total Findings</div>
                        <div className="text-3xl font-bold text-default-900 dark:text-default-100">
                          {dashboardStats?.findings?.total ?? 0}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-default-500">Critical</div>
                        <div className="text-3xl font-bold text-danger flex items-center gap-2">
                          <AlertTriangle className="w-6 h-6" />
                          {dashboardStats?.findings?.critical ?? 0}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-default-500">High</div>
                        <div className="text-2xl font-bold text-warning">
                          {dashboardStats?.findings?.high ?? 0}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-default-500">Remediation Tasks</div>
                        <div className="text-3xl font-bold text-default-900 dark:text-default-100">
                          {dashboardStats?.remediationTasks ?? 0}
                        </div>
                      </div>
                      {dashboardStats?.latestReport?.score !== null && dashboardStats?.latestReport?.score !== undefined && (
                        <div className="space-y-1 pt-4 border-t border-default-200 dark:border-default-100">
                          <div className="text-sm font-medium text-default-500">Overall Score</div>
                          <div className="text-3xl font-bold" style={{
                            color: dashboardStats.latestReport.score >= 80 ? '#10b981' :
                                   dashboardStats.latestReport.score >= 60 ? '#f59e0b' : '#ef4444'
                          }}>
                            {dashboardStats.latestReport.score.toFixed(1)}%
                          </div>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </div>
              </div>
            )}
          </Tab>

          <Tab key="findings" title="Findings">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
              <ErrorBoundary>
                <Card className="lg:col-span-2 shadow-lg border border-default-200 dark:border-default-100">
                  <CardHeader className="pb-3">
                    <h3 className="text-xl font-bold">Gap Feed</h3>
                    <p className="text-sm text-default-500 mt-1">
                      Compliance findings and evidence
                    </p>
                  </CardHeader>
                  <CardBody>
                    <GapFeed framework={selectedFramework} />
                  </CardBody>
                </Card>
              </ErrorBoundary>

              <ErrorBoundary>
                <Card className="shadow-lg border border-default-200 dark:border-default-100">
                  <CardHeader className="pb-3">
                    <h3 className="text-xl font-bold">Evidence Inspector</h3>
                    <p className="text-sm text-default-500 mt-1">
                      View evidence for selected finding
                    </p>
                  </CardHeader>
                  <CardBody>
                    <EvidenceInspector />
                  </CardBody>
                </Card>
              </ErrorBoundary>
            </div>
          </Tab>

          <Tab key="remediation" title="Remediation">
            <Card className="mt-6 shadow-lg border border-default-200 dark:border-default-100">
              <CardHeader className="pb-3">
                <h3 className="text-xl font-bold">Remediation Plan</h3>
                <p className="text-sm text-default-500 mt-1">
                  Action items and task tracking
                </p>
              </CardHeader>
              <CardBody>
                <RemediationPlan />
              </CardBody>
            </Card>
          </Tab>

          <Tab key="swarm" title="Swarm Analysis">
            <div className="space-y-6 mt-6">
              <ErrorBoundary>
                <AgentActivityMonitor agentRunId={swarmRunId} />
              </ErrorBoundary>
              
              {swarmRunId ? (
                <ErrorBoundary>
                  <SwarmReport agentRunId={swarmRunId} />
                </ErrorBoundary>
              ) : (
                <Card className="shadow-lg border border-default-200 dark:border-default-100">
                  <CardHeader className="pb-3">
                    <h3 className="text-xl font-bold">Swarm Report</h3>
                    <p className="text-sm text-default-500 mt-1">
                      Detailed compliance analysis report will appear here after analysis completes
                    </p>
                  </CardHeader>
                  <CardBody className="py-12 text-center">
                    <div className="max-w-md mx-auto space-y-4">
                      <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                        <Shield className="w-10 h-10 text-primary" />
                      </div>
                      <p className="text-default-600 dark:text-default-400 text-lg">
                        No swarm analysis report available yet.
                      </p>
                      <Button 
                        color="primary"
                        size="lg"
                        onPress={async () => {
                          setIsRunning(true);
                          try {
                            const response = await fetch('/api/swarm/run', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                projectId: selectedProject,
                                framework: selectedFramework,
                              }),
                            });
                            const data = await response.json();
                            if (data.success) {
                              setSwarmRunId(data.agentRunId);
                            } else {
                              alert(`Failed to start swarm: ${data.error || 'Unknown error'}`);
                            }
                          } catch (error: any) {
                            console.error('Error starting swarm:', error);
                            alert(`Error starting swarm: ${error.message || 'Unknown error'}`);
                          } finally {
                            setIsRunning(false);
                          }
                        }}
                        isDisabled={isRunning || !selectedProject}
                        startContent={isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                      >
                        {isRunning ? 'Starting...' : 'Run Swarm Analysis'}
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          </Tab>

          <Tab key="connections" title="MCP Connections">
            <div className="mt-6">
              <ErrorBoundary>
                <MCPConnectionManager />
              </ErrorBoundary>
            </div>
          </Tab>

          <Tab key="reports" title="Reports">
            <div className="mt-6 space-y-4">
              {loadingReports ? (
                <Card className="shadow-lg border border-default-200 dark:border-default-100">
                  <CardBody className="py-12">
                    <div className="space-y-4">
                      <CardSkeleton />
                      <CardSkeleton />
                      <CardSkeleton />
                    </div>
                  </CardBody>
                </Card>
              ) : reports.length === 0 ? (
                <Card className="shadow-lg border border-default-200 dark:border-default-100">
                  <CardBody className="py-12 text-center">
                    <FileText className="w-12 h-12 text-default-400 mx-auto mb-4" />
                    <p className="text-default-500 text-lg">No reports available yet</p>
                    <p className="text-default-400 text-sm mt-2">Run a compliance analysis to generate reports</p>
                  </CardBody>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reports.map((report) => (
                    <Card key={report.id} className="shadow-lg border border-default-200 dark:border-default-100 hover:shadow-xl transition-shadow cursor-pointer">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            <h3 className="text-lg font-bold">{report.framework}</h3>
                          </div>
                          {report.score !== null && (
                            <Chip
                              color={report.score >= 80 ? 'success' : report.score >= 60 ? 'warning' : 'danger'}
                              variant="flat"
                              size="sm"
                            >
                              {report.score.toFixed(1)}%
                            </Chip>
                          )}
                        </div>
                      </CardHeader>
                      <CardBody>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-default-500">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="text-sm">
                            <span className="font-semibold">{report.findingsCount}</span> findings
                          </div>
                          {report.storageUrl && (
                            <Button
                              size="sm"
                              variant="flat"
                              color="primary"
                              onPress={() => window.open(report.storageUrl, '_blank')}
                            >
                              View Full Report
                            </Button>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Tab>

        </Tabs>

        {/* New Project Modal */}
        {showNewProjectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4 shadow-2xl border border-default-200 dark:border-default-100">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between w-full">
                  <h3 className="text-xl font-bold">Create New Project</h3>
                  <Button
                    isIconOnly
                    variant="light"
                    size="sm"
                    onPress={() => {
                      setShowNewProjectModal(false);
                      setNewProjectName('');
                      setNewProjectDescription('');
                    }}
                  >
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-default-600 dark:text-default-400 mb-2 block">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Enter project name"
                    className="w-full px-4 py-2 rounded-lg border border-default-300 dark:border-default-200 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-default-600 dark:text-default-400 mb-2 block">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Enter project description"
                    rows={3}
                    className="w-full px-4 py-2 rounded-lg border border-default-300 dark:border-default-200 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    variant="flat"
                    onPress={() => {
                      setShowNewProjectModal(false);
                      setNewProjectName('');
                      setNewProjectDescription('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    onPress={createNewProject}
                    isDisabled={!newProjectName.trim()}
                  >
                    Create Project
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}

function RemediationPlan() {
  return (
    <div className="space-y-4">
      <div className="text-center py-12 rounded-lg bg-default-50 dark:bg-default-100 border border-dashed border-default-300 dark:border-default-200">
        <p className="text-default-500 text-lg">Remediation tasks will appear here</p>
      </div>
    </div>
  );
}

