'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { FileText, Download, ExternalLink } from 'lucide-react';

interface DetailedReport {
  executiveSummary: string;
  sections: Array<{
    title: string;
    content: string;
    evidence: Array<{
      source: string;
      type: string;
      citation: string;
      quote?: string;
    }>;
  }>;
  findings: Array<{
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    evidence: Array<{
      source: string;
      citation: string;
      quote: string;
    }>;
    recommendation: string;
  }>;
  complianceScore: {
    overall: number;
    byCategory: Record<string, number>;
  };
  metadata: {
    framework: string;
    generatedAt: string;
    dataSources: string[];
    extractionAgents: string[];
  };
}

export function SwarmReport({ agentRunId }: { agentRunId: string }) {
  const [report, setReport] = useState<DetailedReport | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [agentRunId]);

  const fetchReport = async () => {
    try {
      const response = await fetch(`/api/swarm/report?agentRunId=${agentRunId}`);
      const data = await response.json();
      setReport(data.report);
      // Set reportId if available from API response
      if (data.reportId) {
        setReportId(data.reportId);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (format: 'md' | 'json' = 'md') => {
    if (!report) return;

    setDownloading(true);
    try {
      // If we have a reportId, try to download from storage
      if (reportId) {
        try {
          const downloadUrl = `/api/reports/${reportId}/download?format=${format}`;
          const response = await fetch(downloadUrl);
          
          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${report.metadata.framework}-compliance-report-${Date.now()}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return;
          }
        } catch (downloadError) {
          console.warn('Failed to download from storage, generating client-side:', downloadError);
        }
      }

      // Fallback: Generate client-side
      let content: string;
      let mimeType: string;
      let extension: string;

      if (format === 'json') {
        content = JSON.stringify(report, null, 2);
        mimeType = 'application/json';
        extension = 'json';
      } else {
        content = `
# ${report.metadata.framework} Compliance Report

Generated: ${new Date(report.metadata.generatedAt).toLocaleString()}
Data Sources: ${report.metadata.dataSources.join(', ')}
Extraction Agents: ${report.metadata.extractionAgents.join(', ')}

## Executive Summary

${report.executiveSummary}

## Compliance Score

Overall: ${report.complianceScore.overall}/100

${Object.entries(report.complianceScore.byCategory)
  .map(([cat, score]) => `- ${cat}: ${score}/100`)
  .join('\n')}

## Findings

${report.findings
  .map(
    (f, i) => `
### ${i + 1}. ${f.title}

**Severity**: ${f.severity.toUpperCase()}
**Description**: ${f.description}

**Evidence**:
${f.evidence.map(e => `- ${e.citation}\n  Quote: "${e.quote}"`).join('\n')}

**Recommendation**: ${f.recommendation}
`
  )
  .join('\n')}

## Detailed Sections

${report.sections
  .map(
    (s) => `
### ${s.title}

${s.content}

**Evidence Citations**:
${s.evidence.map(e => `- ${e.citation}`).join('\n')}
`
  )
  .join('\n')}
    `.trim();
        mimeType = 'text/markdown';
        extension = 'md';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.metadata.framework}-compliance-report-${Date.now()}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Failed to export report. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading report...</div>;
  }

  if (!report) {
    return <div className="text-center py-8">Report not available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Swarm Analysis Report</h2>
          <p className="text-gray-600">
            {report.metadata.framework} Compliance Assessment
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => exportReport('md')} 
            variant="outline"
            disabled={downloading}
          >
            <Download className="w-4 h-4 mr-2" />
            {downloading ? 'Downloading...' : 'Download MD'}
          </Button>
          <Button 
            onClick={() => exportReport('json')} 
            variant="outline"
            disabled={downloading}
          >
            <Download className="w-4 h-4 mr-2" />
            {downloading ? 'Downloading...' : 'Download JSON'}
          </Button>
        </div>
      </div>

      {/* Compliance Score */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center mb-6">
            <div className="text-5xl font-bold text-gray-900 mb-2">
              {report.complianceScore.overall}
            </div>
            <div className="text-sm text-gray-600">Overall Score / 100</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(report.complianceScore.byCategory).map(([cat, score]) => (
              <div key={cat} className="text-center">
                <div className="text-2xl font-bold">{score}</div>
                <div className="text-xs text-gray-600">{cat}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line">{report.executiveSummary}</p>
        </CardContent>
      </Card>

      {/* Findings */}
      <Card>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
          <CardDescription>
            {report.findings.length} compliance issues identified
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {report.findings.map((finding, index) => (
              <Card key={index} className="border-l-4 border-l-orange-500">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{finding.title}</CardTitle>
                    <Badge
                      variant="outline"
                      className={
                        finding.severity === 'critical'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : finding.severity === 'high'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : ''
                      }
                    >
                      {finding.severity.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-4">{finding.description}</p>
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2">Evidence:</div>
                    {finding.evidence.map((ev, i) => (
                      <div key={i} className="mb-2 p-2 bg-gray-50 rounded text-sm">
                        <div className="font-medium">{ev.citation}</div>
                        <div className="text-gray-600 italic mt-1">"{ev.quote}"</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1">Recommendation:</div>
                    <p className="text-sm">{finding.recommendation}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Sections */}
      <Tabs defaultValue="sections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sections">Detailed Sections</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="sections" className="space-y-4">
          {report.sections.map((section, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-line mb-4">{section.content}</div>
                <div>
                  <div className="text-sm font-medium mb-2">Evidence Citations:</div>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                    {section.evidence.map((ev, i) => (
                      <li key={i}>{ev.citation}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="metadata">
          <Card>
            <CardHeader>
              <CardTitle>Report Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Framework:</span> {report.metadata.framework}
                </div>
                <div>
                  <span className="font-medium">Generated:</span>{' '}
                  {new Date(report.metadata.generatedAt).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">Data Sources:</span>{' '}
                  {report.metadata.dataSources.join(', ')}
                </div>
                <div>
                  <span className="font-medium">Extraction Agents:</span>{' '}
                  {report.metadata.extractionAgents.join(', ')}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

