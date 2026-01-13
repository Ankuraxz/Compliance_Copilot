'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Plus, Key, Lock, Trash2, 
  Cloud, Github, Code, Database, 
  Activity, MessageSquare, 
  // Service-specific icons
  Server, // AWS
  Building2, // Azure
  Zap, // Cloudflare
  Layers, // Supabase
  GitBranch, // GitHub
  GitMerge, // ArgoCD
  Shield, // SonarQube
  AlertCircle, // Sentry
  BarChart3, // DataDog
  Settings, // Jenkins
  Palette, // MIRO
  TrendingUp, // DASH0
  Globe, // GCloud
  LineChart, // Grafana
  FileText, // Notion
  Briefcase, // Atlassian
} from 'lucide-react';
import {
  awsCoreMCPConfig,
  azureMCPConfig,
  cloudflareMCPConfig,
  supabaseMCPConfigHTTP,
  githubMCPConfig,
  argocdMCPConfig,
  sonarqubeMCPConfig,
  sentryMCPConfig,
  notionMCPConfig,
  atlassianMCPConfig,
  datadogMCPConfig,
  jenkinsMCPConfig,
  miroMCPConfig,
  dash0MCPConfig,
  gcloudMCPConfig,
  grafanaMCPConfig,
  // Analysis & Research servers (Firecrawl, Perplexity, Browserbase, Playwright) 
  // are for internal SaaS use only, not shown to end users
  // Cloudflare Container MCP is also for internal use only (uses CLOUDFLARE_API_TOKEN from env)
} from '@/mcp/servers/config-extended';

interface MCPConnection {
  id: string;
  serverName: string;
  authType: 'oauth' | 'api_key' | 'api_token' | 'env';
  isActive: boolean;
}

export function MCPConnectionManager() {
  const [connections, setConnections] = useState<MCPConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [authType, setAuthType] = useState<'oauth' | 'api_key' | 'api_token' | 'env'>('oauth');
  const [apiKey, setApiKey] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [customEnv, setCustomEnv] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      const response = await fetch('/api/mcp/connections');
      const data = await response.json();
      setConnections(data.connections || []);
    } catch (error) {
      console.error('Error fetching connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthConnect = async (serverName: string) => {
    try {
      const response = await fetch('/api/mcp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName }),
      });

      const data = await response.json();
      if (data.authUrl) {
        // Open OAuth in popup instead of redirecting
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        
        const popup = window.open(
          data.authUrl,
          'oauth-popup',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
        );

        // Listen for message from popup
        const messageListener = async (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'oauth-success') {
            const { serverName: connectedServer, token } = event.data;
            
            // Store token in sessionStorage with 1 year expiration
            const expirationDate = new Date();
            expirationDate.setFullYear(expirationDate.getFullYear() + 1);
            
            const tokenData = {
              accessToken: token,
              token: token, // Keep both for compatibility
              expiresAt: expirationDate.toISOString(),
              serverName: connectedServer,
            };
            
            sessionStorage.setItem(`mcp_${connectedServer}_token`, JSON.stringify(tokenData));
            
            // Save connection to database
            try {
              const saveResponse = await fetch('/api/mcp/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  serverName: connectedServer,
                  authType: 'oauth',
                  credentials: {
                    accessToken: token,
                  },
                }),
              });

              if (!saveResponse.ok) {
                const errorData = await saveResponse.json();
                console.error('Failed to save connection:', errorData);
                alert(`Connection established but failed to save: ${errorData.error || 'Unknown error'}`);
              }
            } catch (saveError) {
              console.error('Error saving connection:', saveError);
              alert('Connection established but failed to save to database');
            }
            
            // Refresh connections list
            await fetchConnections();
            
            window.removeEventListener('message', messageListener);
            if (popup) popup.close();
          } else if (event.data.type === 'oauth-error') {
            console.error('OAuth error:', event.data.error);
            window.removeEventListener('message', messageListener);
            if (popup) popup.close();
          }
        };

        window.addEventListener('message', messageListener);

        // Check if popup was closed manually
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('OAuth connect error:', error);
    }
  };

  const handleBYOKConnect = async () => {
    if (!selectedServer) return;

    try {
      const response = await fetch('/api/mcp/connect-byok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverName: selectedServer,
          apiKey: authType === 'api_key' ? apiKey : undefined,
          apiToken: authType === 'api_token' ? apiToken : undefined,
          customEnv: authType === 'env' ? customEnv : undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Store credentials in sessionStorage with 1 year expiration
        const expirationDate = new Date();
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
        
        const credentialData = {
          serverName: selectedServer,
          authType,
          credentials: {
            apiKey: authType === 'api_key' ? apiKey : undefined,
            apiToken: authType === 'api_token' ? apiToken : undefined,
            customEnv: authType === 'env' ? customEnv : undefined,
          },
          expiresAt: expirationDate.toISOString(),
        };
        
        sessionStorage.setItem(`mcp_${selectedServer}_credentials`, JSON.stringify(credentialData));
        
        await fetchConnections();
        setSelectedServer(null);
        setApiKey('');
        setApiToken('');
        setCustomEnv({});
      }
    } catch (error) {
      console.error('BYOK connect error:', error);
    }
  };

  const handleDelete = async (serverName: string) => {
    try {
      const response = await fetch(`/api/mcp/connections?serverName=${serverName}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchConnections();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  // User-facing servers (for end users to connect)
  const cloudServers = [awsCoreMCPConfig, azureMCPConfig, cloudflareMCPConfig, gcloudMCPConfig];
  const codeServers = [githubMCPConfig, argocdMCPConfig, sonarqubeMCPConfig, jenkinsMCPConfig];
  const monitoringServers = [sentryMCPConfig, datadogMCPConfig, dash0MCPConfig, grafanaMCPConfig];
  const communicationServers = [notionMCPConfig, atlassianMCPConfig, miroMCPConfig];
  
  // Analysis & Research servers are for internal SaaS use only, not shown to users
  // Cloudflare Container MCP is also for internal use only (uses CLOUDFLARE_API_TOKEN from env)

  /**
   * Convert server name to Camel Case
   * e.g., "aws-core" -> "AWS Core", "github" -> "GitHub"
   */
  const formatServerName = (name: string): string => {
    const nameMap: Record<string, string> = {
      'aws-core': 'AWS Core',
      'gcloud': 'Google Cloud',
      'github': 'GitHub',
      'argocd': 'ArgoCD',
      'sonarqube': 'SonarQube',
      'datadog': 'DataDog',
      'dash0': 'DASH0',
      'atlassian': 'Atlassian',
      'miro': 'MIRO',
      'jenkins': 'Jenkins',
      'grafana': 'Grafana',
      'sentry': 'Sentry',
      'notion': 'Notion',
      'cloudflare': 'Cloudflare',
      'azure': 'Azure',
      'supabase': 'Supabase',
    };
    
    return nameMap[name] || name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  /**
   * Get icon for server
   */
  const getServerIcon = (name: string) => {
    const iconMap: Record<string, any> = {
      'aws-core': Server,
      'azure': Building2,
      'cloudflare': Zap,
      'gcloud': Globe,
      'supabase': Layers,
      'github': Github,
      'argocd': GitMerge,
      'sonarqube': Shield,
      'jenkins': Settings,
      'sentry': AlertCircle,
      'datadog': BarChart3,
      'dash0': TrendingUp,
      'grafana': LineChart,
      'notion': FileText,
      'atlassian': Briefcase,
      'miro': Palette,
    };
    
    return iconMap[name] || Cloud;
  };

  const isConnected = (serverName: string) => {
    // Check database connection
    const dbConnected = connections.some(c => c.serverName === serverName && c.isActive);
    
    // Also check sessionStorage for tokens/credentials
    const tokenData = sessionStorage.getItem(`mcp_${serverName}_token`);
    const credentialData = sessionStorage.getItem(`mcp_${serverName}_credentials`);
    
    return dbConnected || !!tokenData || !!credentialData;
  };

  const getConnection = (serverName: string) => {
    return connections.find(c => c.serverName === serverName && c.isActive);
  };

  const getConnectionStatus = (serverName: string): 'connected' | 'expiring' | 'disconnected' => {
    // Check if connected
    const connected = isConnected(serverName);
    if (!connected) return 'disconnected';

    // Check token expiration
    const tokenData = sessionStorage.getItem(`mcp_${serverName}_token`);
    const credentialData = sessionStorage.getItem(`mcp_${serverName}_credentials`);
    
    const checkExpiration = (data: string | null): boolean => {
      if (!data) return false;
      try {
        const parsed = JSON.parse(data);
        if (parsed.expiresAt) {
          const expirationDate = new Date(parsed.expiresAt);
          const now = new Date();
          const daysUntilExpiration = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          // Consider expiring if less than 30 days remaining
          return daysUntilExpiration < 30 && daysUntilExpiration > 0;
        }
      } catch {
        return false;
      }
      return false;
    };

    const tokenExpiring = checkExpiration(tokenData);
    const credentialExpiring = checkExpiration(credentialData);

    if (tokenExpiring || credentialExpiring) {
      return 'expiring';
    }

    return 'connected';
  };

  if (loading) {
    return <div className="text-center py-8">Loading connections...</div>;
  }

  // Check required connections
  const isGitHubConnected = isConnected('github');
  const cloudServersList = ['aws-core', 'azure', 'cloudflare', 'gcloud'];
  const isCloudServiceConnected = cloudServersList.some(server => isConnected(server));
  const hasRequiredConnections = isGitHubConnected && isCloudServiceConnected;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">MCP Connections</h2>
          <p className="text-gray-600">Connect to MCP servers using OAuth or BYOK</p>
        </div>
      </div>

      {/* Required Connections Alert */}
      {!hasRequiredConnections && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-2">Required Connections</h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-3">
                To run compliance analysis, you must connect:
              </p>
              <ul className="list-disc list-inside text-sm text-yellow-800 dark:text-yellow-300 space-y-1 mb-3">
                <li className={isGitHubConnected ? 'line-through opacity-60' : ''}>
                  <strong>GitHub</strong> (required for code analysis)
                </li>
                <li className={isCloudServiceConnected ? 'line-through opacity-60' : ''}>
                  <strong>At least one cloud service</strong> (AWS, Azure, Cloudflare, or Google Cloud)
                </li>
              </ul>
              {!isGitHubConnected && (
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-2">
                  ⚠️ Please connect GitHub to proceed with compliance analysis.
                </p>
              )}
              {!isCloudServiceConnected && (
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-2">
                  ⚠️ Please connect at least one cloud service (AWS, Azure, Cloudflare, or Google Cloud) to proceed.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {hasRequiredConnections && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500" />
            <p className="text-sm text-green-800 dark:text-green-300">
              <strong>All required connections are active.</strong> You can now run compliance analysis.
            </p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-900 mb-3">
          <strong>💡 How to connect:</strong> Click <strong>OAuth</strong> for one-click authorization (recommended), or <strong>BYOK</strong> to enter API keys/tokens manually. 
          For detailed step-by-step instructions for each service (AWS, Azure, GitHub, Atlassian, etc.), see{' '}
          <a
            href="/docs/MCP_CONNECTION_GUIDE"
            target="_blank"
            className="text-blue-600 hover:underline font-semibold"
          >
            MCP Connection Guide
          </a>
          .
        </p>
        <div className="flex items-center gap-4 text-xs text-blue-800">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Connected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>Expiring soon</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <span>Not connected</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="cloud" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cloud">Cloud & Infrastructure</TabsTrigger>
          <TabsTrigger value="code">Code & CI/CD</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
        </TabsList>

        <TabsContent value="cloud" className="space-y-4">
          <ServerList
            servers={cloudServers}
            isConnected={isConnected}
            getConnection={getConnection}
            getConnectionStatus={getConnectionStatus}
            onOAuthConnect={handleOAuthConnect}
            onBYOKConnect={(server) => setSelectedServer(server)}
            onDelete={handleDelete}
            formatServerName={formatServerName}
            getServerIcon={getServerIcon}
          />
        </TabsContent>

        <TabsContent value="code" className="space-y-4">
          <ServerList
            servers={codeServers}
            isConnected={isConnected}
            getConnection={getConnection}
            getConnectionStatus={getConnectionStatus}
            onOAuthConnect={handleOAuthConnect}
            onBYOKConnect={(server) => setSelectedServer(server)}
            onDelete={handleDelete}
            formatServerName={formatServerName}
            getServerIcon={getServerIcon}
          />
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <ServerList
            servers={monitoringServers}
            isConnected={isConnected}
            getConnection={getConnection}
            getConnectionStatus={getConnectionStatus}
            onOAuthConnect={handleOAuthConnect}
            onBYOKConnect={(server) => setSelectedServer(server)}
            onDelete={handleDelete}
            formatServerName={formatServerName}
            getServerIcon={getServerIcon}
          />
        </TabsContent>

        <TabsContent value="communication" className="space-y-4">
          <ServerList
            servers={communicationServers}
            isConnected={isConnected}
            getConnection={getConnection}
            getConnectionStatus={getConnectionStatus}
            onOAuthConnect={handleOAuthConnect}
            onBYOKConnect={(server) => setSelectedServer(server)}
            onDelete={handleDelete}
            formatServerName={formatServerName}
            getServerIcon={getServerIcon}
          />
        </TabsContent>
      </Tabs>

      {/* BYOK Dialog */}
      <Dialog open={!!selectedServer} onOpenChange={(open) => !open && setSelectedServer(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
            <DialogTitle>Connect {selectedServer ? formatServerName(selectedServer) : 'Server'} with BYOK</DialogTitle>
            <DialogDescription>
              Enter your credentials. Need help? See{' '}
              <a
                href="/docs/MCP_CONNECTION_GUIDE"
                target="_blank"
                className="text-blue-600 hover:underline"
              >
                Connection Guide
              </a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Authentication Type</Label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              >
                <option value="api_key">API Key</option>
                <option value="api_token">API Token</option>
                <option value="env">Environment Variables (JSON)</option>
              </select>
            </div>

            {authType === 'api_key' && (
              <div>
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get your API key from the service's dashboard or settings
                </p>
              </div>
            )}

            {authType === 'api_token' && (
              <div>
                <Label>API Token</Label>
                <Input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Enter your API token"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get your API token from the service's security settings
                </p>
              </div>
            )}

            {authType === 'env' && (
              <div>
                <Label>Environment Variables (JSON)</Label>
                <textarea
                  value={JSON.stringify(customEnv, null, 2)}
                  onChange={(e) => {
                    try {
                      setCustomEnv(JSON.parse(e.target.value));
                    } catch {}
                  }}
                  className="w-full mt-1 px-3 py-2 border rounded-md font-mono text-sm"
                  rows={8}
                  placeholder={
                    selectedServer === 'aws-core'
                      ? '{\n  "AWS_ACCESS_KEY_ID": "your_key",\n  "AWS_SECRET_ACCESS_KEY": "your_secret",\n  "AWS_REGION": "us-east-1"\n}'
                      : selectedServer === 'azure'
                      ? '{\n  "AZURE_CLIENT_ID": "your_client_id",\n  "AZURE_CLIENT_SECRET": "your_secret",\n  "AZURE_TENANT_ID": "your_tenant_id"\n}'
                      : '{\n  "KEY": "value"\n}'
                  }
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter environment variables as JSON. Example for AWS: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleBYOKConnect} className="flex-1">
                Connect
              </Button>
              <Button variant="outline" onClick={() => setSelectedServer(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServerList({
  servers,
  isConnected,
  getConnection,
  getConnectionStatus,
  onOAuthConnect,
  onBYOKConnect,
  onDelete,
  formatServerName,
  getServerIcon,
}: {
  servers: any[];
  isConnected: (name: string) => boolean;
  getConnection: (name: string) => MCPConnection | undefined;
  getConnectionStatus: (name: string) => 'connected' | 'expiring' | 'disconnected';
  onOAuthConnect: (name: string) => void;
  onBYOKConnect: (name: string) => void;
  onDelete: (name: string) => void;
  formatServerName: (name: string) => string;
  getServerIcon: (name: string) => any;
}) {
  return (
    <div className="grid gap-4">
      {servers.map((server) => {
        const connected = isConnected(server.name);
        const connection = getConnection(server.name);
        const status = getConnectionStatus(server.name);

        // Status dot component
        const StatusDot = () => {
          if (status === 'connected') {
            return (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" title="Connected" />
                <span className="text-xs text-gray-600">Connected</span>
              </div>
            );
          } else if (status === 'expiring') {
            return (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" title="Token expiring soon" />
                <span className="text-xs text-yellow-700">Expiring soon</span>
              </div>
            );
          } else {
            return (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400" title="Not connected" />
                <span className="text-xs text-gray-500">Not connected</span>
              </div>
            );
          }
        };

        const isComingSoon = (server as any).comingSoon === true;
        const ServerIcon = getServerIcon(server.name);
        const displayName = formatServerName(server.name);

        return (
          <Card key={server.name} className="hover:shadow-lg transition-all duration-200 border-default-200 dark:border-default-100">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-4">
                    {/* Icon Container */}
                    <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500/10 via-primary-600/10 to-primary-500/10 dark:from-primary-500/20 dark:via-primary-600/20 dark:to-primary-500/20 flex items-center justify-center border-2 border-primary-200/50 dark:border-primary-800/50 shadow-sm">
                      <ServerIcon className="w-7 h-7 text-primary" />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg font-semibold text-foreground">{displayName}</CardTitle>
                        <StatusDot />
                        {isComingSoon && (
                          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700">
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm text-default-600 dark:text-default-400 leading-relaxed">
                        {server.description}
                      </CardDescription>
                    </div>
                  </div>
                </div>
                
                {/* Auth Type Badge */}
                <div className="flex-shrink-0">
                  {connected && connection && (
                    <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700">
                      {connection.authType.toUpperCase()}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {server.oauth && !isComingSoon && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOAuthConnect(server.name)}
                    disabled={connected || isComingSoon}
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    OAuth
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBYOKConnect(server.name)}
                  disabled={connected || isComingSoon}
                  title={isComingSoon ? 'This service is coming soon' : ''}
                >
                  <Key className="w-4 h-4 mr-2" />
                  BYOK
                </Button>
                {connected && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(server.name)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Disconnect
                  </Button>
                )}
              </div>
              {isComingSoon && (
                <p className="text-xs text-yellow-600 mt-2">
                  This integration is coming soon. You can add your API keys, but backend integration is pending.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

