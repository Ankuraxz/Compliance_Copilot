/**
 * API route to initiate OAuth flow for MCP servers
 */

import { NextRequest, NextResponse } from 'next/server';
import { mcpClientManager } from '@/mcp/client';
import { registerAllMCPServers } from '@/mcp/servers/config-extended';

// Register servers on module load
registerAllMCPServers(mcpClientManager);

export async function POST(request: NextRequest) {
  try {
    const { serverName } = await request.json();

    if (!serverName) {
      return NextResponse.json(
        { error: 'Server name is required' },
        { status: 400 }
      );
    }

    // Use environment variable for callback URL, fallback to request origin
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const redirectUri = `${appUrl}/api/auth/oauth/${serverName}/callback`;
    const state = crypto.randomUUID();

    const authUrl = mcpClientManager.getOAuthUrl(serverName, redirectUri, state);

    // Store state in session/cookie for verification
    const response = NextResponse.json({ authUrl, state });
    response.cookies.set(`mcp_${serverName}_state`, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (error: any) {
    console.error('MCP connect error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate OAuth flow' },
      { status: 500 }
    );
  }
}

