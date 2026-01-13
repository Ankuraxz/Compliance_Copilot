'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileCode, ExternalLink, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Evidence {
  id: string;
  type: 'code' | 'documentation' | 'config' | 'log';
  source: string;
  filePath?: string;
  lineNumber?: number;
  content: string;
  url?: string;
}

export function EvidenceInspector() {
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);

  useEffect(() => {
    // Fetch evidence for selected finding
    // This would be called when a finding is selected in GapFeed
    // For now, using mock data
    setEvidence([
      {
        id: '1',
        type: 'code',
        source: 'github',
        filePath: 'src/auth/middleware.ts',
        lineNumber: 45,
        content: `export async function authenticate(req: Request) {
  const token = req.headers.get('Authorization');
  if (!token) {
    return { error: 'Unauthorized' };
  }
  // Missing token validation logic
  return { user: null };
}`,
      },
    ]);
    setSelectedEvidence(evidence[0] || null);
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'code':
        return <FileCode className="w-4 h-4" />;
      default:
        return <ExternalLink className="w-4 h-4" />;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!selectedEvidence) {
    return (
      <div className="text-center py-8 text-gray-600">
        Select a finding to view evidence
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Evidence Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getTypeIcon(selectedEvidence.type)}
          <span className="font-medium">{selectedEvidence.source}</span>
        </div>
        <Badge variant="outline">{selectedEvidence.type}</Badge>
      </div>

      {/* File Path */}
      {selectedEvidence.filePath && (
        <div className="text-sm text-gray-600">
          <span className="font-medium">File:</span> {selectedEvidence.filePath}
          {selectedEvidence.lineNumber && (
            <span className="ml-2">
              (Line {selectedEvidence.lineNumber})
            </span>
          )}
        </div>
      )}

      {/* Evidence Content */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Evidence Content</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(selectedEvidence.content)}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-50 p-4 rounded-lg text-xs overflow-x-auto">
            <code>{selectedEvidence.content}</code>
          </pre>
        </CardContent>
      </Card>

      {/* External Link */}
      {selectedEvidence.url && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => window.open(selectedEvidence.url, '_blank')}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          View Source
        </Button>
      )}

      {/* All Evidence List */}
      {evidence.length > 1 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">All Evidence</div>
          {evidence.map((item) => (
            <Card
              key={item.id}
              className={`cursor-pointer ${
                selectedEvidence.id === item.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => setSelectedEvidence(item)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(item.type)}
                    <span className="text-sm">{item.filePath || item.source}</span>
                  </div>
                  {item.lineNumber && (
                    <span className="text-xs text-gray-500">
                      Line {item.lineNumber}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

