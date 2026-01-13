'use client';

import { RadialBarChart, RadialBar, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Card, CardBody } from '@heroui/react';
import { useTheme } from 'next-themes';

interface ComplianceRadialChartProps {
  framework: string;
  reportData?: {
    overallScore: number;
    byCategory: Record<string, number>;
  } | null;
}

export function ComplianceRadialChart({ framework, reportData }: ComplianceRadialChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  // Use real data from report if available, otherwise use default/mock data
  let data: Array<{ name: string; score: number; fill: string }> = [];
  let overallScore = 0;

  if (reportData && reportData.byCategory && Object.keys(reportData.byCategory).length > 0) {
    // Use real report data
    const categoryColors: Record<string, string> = {
      'Access Control': isDark ? '#10b981' : '#10b981',
      'Data Protection': isDark ? '#3b82f6' : '#3b82f6',
      'Monitoring': isDark ? '#f59e0b' : '#f59e0b',
      'Incident Response': isDark ? '#ef4444' : '#ef4444',
      'Business Continuity': isDark ? '#10b981' : '#10b981',
      'General': isDark ? '#8b5cf6' : '#8b5cf6',
    };

    data = Object.entries(reportData.byCategory).map(([name, score]) => ({
      name,
      score: Math.round(score),
      fill: categoryColors[name] || (isDark ? '#6b7280' : '#6b7280'),
    }));

    overallScore = Math.round(reportData.overallScore || 0);
  } else {
    // Default/mock data when no report is available
    data = [
      { name: 'Access Control', score: 0, fill: isDark ? '#6b7280' : '#6b7280' },
      { name: 'Data Protection', score: 0, fill: isDark ? '#6b7280' : '#6b7280' },
      { name: 'Monitoring', score: 0, fill: isDark ? '#6b7280' : '#6b7280' },
      { name: 'Incident Response', score: 0, fill: isDark ? '#6b7280' : '#6b7280' },
      { name: 'Business Continuity', score: 0, fill: isDark ? '#6b7280' : '#6b7280' },
    ];
    overallScore = 0;
  }

  // If no data, show placeholder
  if (data.length === 0 || data.every(item => item.score === 0)) {
    return (
      <div className="space-y-8">
        <div className="text-center py-12">
          <div className="text-6xl font-bold text-default-300 dark:text-default-600 mb-2">
            --
          </div>
          <div className="text-sm font-medium text-default-500 mt-2">No {framework} Score Available</div>
          <p className="text-xs text-default-400 mt-2">Run a compliance analysis to generate scores</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overall Score */}
      <div className="text-center">
        <div className="relative inline-block">
          <div className="text-6xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent mb-2">
            {overallScore}
          </div>
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-primary rounded-full animate-pulse"></div>
        </div>
        <div className="text-sm font-medium text-default-500 mt-2">Overall {framework} Score</div>
      </div>

      {/* Radial Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="25%"
          outerRadius="85%"
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar
            dataKey="score"
            cornerRadius={12}
            fill="#8884d8"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </RadialBar>
          <Legend
            verticalAlign="bottom"
            height={36}
            wrapperStyle={{ paddingTop: '20px' }}
            formatter={(value, entry: any) => (
              <span className="text-sm font-medium" style={{ color: entry.color }}>
                {value}: {entry.payload.score}%
              </span>
            )}
          />
        </RadialBarChart>
      </ResponsiveContainer>

      {/* Category Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {data.map((item) => (
          <Card key={item.name} className="p-4 border border-default-200 dark:border-default-100 shadow-sm hover:shadow-md transition-shadow">
            <CardBody className="p-0">
              <div className="text-xs font-semibold text-default-500 mb-2 uppercase tracking-wide">{item.name}</div>
              <div className="text-3xl font-bold" style={{ color: item.fill }}>
                {item.score}%
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

