'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Terminal, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolCall {
  id: string;
  agent: string;
  tool: string;
  parameters: any;
  status: 'pending' | 'success' | 'error';
  timestamp: Date;
  result?: any;
  error?: string;
  duration?: number;
}

export function MCPConsole() {
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    // Connect to WebSocket or SSE for real-time updates
    // For now, polling the API
    const interval = setInterval(() => {
      fetch('/api/mcp/tool-calls')
        .then((res) => res.json())
        .then((data) => {
          if (data.toolCalls) {
            setToolCalls(data.toolCalls);
          }
        })
        .catch((error) => console.error('Error fetching tool calls:', error));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600 animate-spin" />;
      default:
        return null;
    }
  };

  const formatTimestamp = (timestamp: Date | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString();
  };

  return (
    <div className="space-y-4">
      {/* Console Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-gray-600" />
          <span className="font-medium">MCP Tool Calls</span>
        </div>
        <Badge variant={isStreaming ? 'default' : 'outline'}>
          {isStreaming ? 'Streaming' : 'Idle'}
        </Badge>
      </div>

      {/* Tool Calls List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {toolCalls.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            No tool calls yet. Start an assessment to see activity.
          </div>
        ) : (
          toolCalls.map((call) => (
            <Card
              key={call.id}
              className={cn(
                'border-l-4',
                call.status === 'success' && 'border-l-green-500',
                call.status === 'error' && 'border-l-red-500',
                call.status === 'pending' && 'border-l-yellow-500'
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(call.status)}
                    <span className="font-medium text-sm">{call.agent}</span>
                    <span className="text-xs text-gray-500">→</span>
                    <span className="font-mono text-sm">{call.tool}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatTimestamp(call.timestamp)}
                    {call.duration && ` (${call.duration}ms)`}
                  </span>
                </div>

                {/* Parameters */}
                {call.parameters && Object.keys(call.parameters).length > 0 && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                    <div className="font-medium mb-1">Parameters:</div>
                    <pre className="text-gray-600 overflow-x-auto">
                      {JSON.stringify(call.parameters, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Result or Error */}
                {call.status === 'success' && call.result && (
                  <div className="mt-2 p-2 bg-green-50 rounded text-xs">
                    <div className="font-medium mb-1 text-green-800">Result:</div>
                    <pre className="text-green-700 overflow-x-auto">
                      {typeof call.result === 'string'
                        ? call.result
                        : JSON.stringify(call.result, null, 2)}
                    </pre>
                  </div>
                )}

                {call.status === 'error' && call.error && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-xs">
                    <div className="font-medium mb-1 text-red-800">Error:</div>
                    <div className="text-red-700">{call.error}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

