'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { getSeverityColor } from '@/lib/utils';

interface GapFeedProps {
  framework: string;
}

interface Finding {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  requirementCode: string;
  evidenceCount: number;
}

export function GapFeed({ framework }: GapFeedProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch findings from API
    fetch(`/api/findings?framework=${framework}`)
      .then((res) => res.json())
      .then((data) => {
        setFindings(data.findings || []);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching findings:', error);
        setLoading(false);
      });
  }, [framework]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'high':
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'medium':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-blue-600" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse space-y-3 p-4 border border-default-200 dark:border-default-100 rounded-lg">
            <div className="h-4 bg-default-200 dark:bg-default-800 rounded w-3/4"></div>
            <div className="h-3 bg-default-200 dark:bg-default-800 rounded w-full"></div>
            <div className="h-3 bg-default-200 dark:bg-default-800 rounded w-5/6"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {findings.length === 0 ? (
        <div className="text-center py-12 rounded-lg bg-default-50 dark:bg-default-100 border border-dashed border-default-300 dark:border-default-200">
          <AlertTriangle className="w-12 h-12 text-default-400 mx-auto mb-4" />
          <p className="text-default-600 dark:text-default-400 text-lg font-medium mb-2">
            No findings for {framework}
          </p>
          <p className="text-default-500 dark:text-default-500 text-sm">
            Run an assessment to get started
          </p>
        </div>
      ) : (
        findings.map((finding) => (
          <Card
            key={finding.id}
            className={`cursor-pointer transition-all ${
              selectedFinding === finding.id ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setSelectedFinding(finding.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getSeverityIcon(finding.severity)}
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1">{finding.title}</CardTitle>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant="outline"
                        className={getSeverityColor(finding.severity)}
                      >
                        {finding.severity.toUpperCase()}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {finding.requirementCode}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge variant="outline">{finding.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {finding.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {finding.evidenceCount} evidence item(s)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Open evidence inspector
                  }}
                >
                  View Evidence
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

