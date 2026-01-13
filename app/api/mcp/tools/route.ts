/**
 * API route to list and call MCP tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { mcpClientManager } from '@/mcp/client';
import { registerMCPServers } from '@/mcp/servers/config';
import { cookies } from 'next/headers';

// Register servers on module load
registerMCPServers(mcpClientManager);

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await import('@/lib/supabase/server').then(m => m.createClient());
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const serverName = searchParams.get('server');

    if (!serverName) {
      return NextResponse.json(
        { error: 'Server name is required' },
        { status: 400 }
      );
    }

    // Get access token from cookie
    const cookieStore = await cookies();
    const token = cookieStore.get(`mcp_${serverName}_token`)?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated. Please connect to the MCP server first.' },
        { status: 401 }
      );
    }

    // Connect if not already connected
    try {
      await mcpClientManager.connect(serverName, { accessToken: token, userId: user.id });
    } catch (error) {
      // If connection fails, might need to re-authenticate
      return NextResponse.json(
        { error: 'Connection failed. Please reconnect.', needsReauth: true },
        { status: 401 }
      );
    }

    const tools = await mcpClientManager.listTools(serverName, user.id);

    return NextResponse.json({ tools });
  } catch (error: any) {
    console.error('MCP tools error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list tools' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await import('@/lib/supabase/server').then(m => m.createClient());
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { serverName, toolName, args } = await request.json();

    if (!serverName || !toolName) {
      return NextResponse.json(
        { error: 'Server name and tool name are required' },
        { status: 400 }
      );
    }

    // Get access token from cookie
    const cookieStore = await cookies();
    const token = cookieStore.get(`mcp_${serverName}_token`)?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Connect if not already connected
    await mcpClientManager.connect(serverName, { accessToken: token, userId: user.id });

    const result = await mcpClientManager.callTool(serverName, toolName, args || {}, user.id);

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('MCP tool call error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to call tool' },
      { status: 500 }
    );
  }
}

