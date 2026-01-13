/**
 * OAuth callback handler for MCP server authentication
 * Supports multiple providers (github, supabase, cloudflare, etc.)
 * Returns JSON to popup window instead of redirecting
 */

import { NextRequest, NextResponse } from 'next/server';
import { mcpClientManager } from '@/mcp/client';
import { registerAllMCPServers } from '@/mcp/servers/config-extended';

// Register servers on module load
registerAllMCPServers(mcpClientManager);

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string[] } }
) {
  // Extract provider name from path (e.g., ['github', 'callback'] -> 'github')
  const provider = params.provider?.[0] || '';
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (!provider) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Error</title></head>
        <body>
          <script>
            window.opener?.postMessage({
              type: 'oauth-error',
              error: 'Invalid provider'
            }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
    `;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
  }

  // Return HTML page that posts message to parent window and closes
  if (error) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Error</title></head>
        <body>
          <script>
            window.opener.postMessage({
              type: 'oauth-error',
              error: ${JSON.stringify(error)}
            }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
    `;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
  }

  if (!code) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Error</title></head>
        <body>
          <script>
            window.opener.postMessage({
              type: 'oauth-error',
              error: 'missing_code'
            }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
    `;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
  }

  try {
    // Use environment variable for callback URL, fallback to request origin
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const redirectUri = `${appUrl}/api/auth/oauth/${provider}/callback`;
    const accessToken = await mcpClientManager.exchangeOAuthCode(
      provider,
      code,
      redirectUri
    );

    // Return HTML page that posts success message to parent window
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Success</title></head>
        <body>
          <script>
            window.opener.postMessage({
              type: 'oauth-success',
              serverName: ${JSON.stringify(provider)},
              token: ${JSON.stringify(accessToken)}
            }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
    `;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
  } catch (error: any) {
    console.error('OAuth error:', error);
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Error</title></head>
        <body>
          <script>
            window.opener.postMessage({
              type: 'oauth-error',
              error: ${JSON.stringify(error.message || 'Unknown error')}
            }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
    `;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
  }
}

