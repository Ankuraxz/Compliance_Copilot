/**
 * Documentation Page
 * Serves markdown documentation files
 */

import { notFound } from 'next/navigation';
import { readFile } from 'fs/promises';
import { join } from 'path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PageProps {
  params: {
    slug: string;
  };
}

const allowedDocs = [
  'MCP_CONNECTION_GUIDE',
  'AGENT_WEB_RESEARCH',
  'AGENT_SWARM',
];

export default async function DocPage({ params }: PageProps) {
  const { slug } = params;
  
  // Normalize slug (remove .md extension if present, handle case variations)
  const normalizedSlug = slug.replace(/\.md$/i, '').toUpperCase();
  const docName = normalizedSlug;
  
  if (!allowedDocs.includes(docName)) {
    notFound();
  }

  try {
    const filePath = join(process.cwd(), 'docs', `${docName}.md`);
    const fileContent = await readFile(filePath, 'utf-8');

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600 hover:prose-a:text-blue-800 prose-code:bg-gray-100 prose-code:text-gray-900 prose-pre:bg-gray-900 prose-pre:text-gray-100">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a({ node, href, children, ...props }: any) {
                    return (
                      <a
                        href={href}
                        className="text-blue-600 hover:text-blue-800 underline"
                        target={href?.startsWith('http') ? '_blank' : undefined}
                        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline ? (
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    ) : (
                      <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {fileContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error reading doc file:', error);
    notFound();
  }
}

