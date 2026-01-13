/**
 * API route for MCP connection management
 * Supports both OAuth and BYOK (Bring Your Own Key)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  storeMCPConnection,
  getMCPConnection,
  listMCPConnections,
  deleteMCPConnection,
} from '@/lib/mcp-connection';
import { mcpClientManager } from '@/mcp/client';
import { registerAllMCPServers } from '@/mcp/servers/config-extended';

// Register all servers
registerAllMCPServers(mcpClientManager);

/**
 * GET - List all MCP connections for user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');

    const connections = await listMCPConnections(user.id, projectId || undefined);

    return NextResponse.json({ connections });
  } catch (error: any) {
    console.error('MCP connections fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch connections' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create or update MCP connection (OAuth or BYOK)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      serverName,
      authType,
      credentials,
      projectId,
    }: {
      serverName: string;
      authType: 'oauth' | 'api_key' | 'api_token' | 'env';
      credentials: {
        accessToken?: string;
        apiKey?: string;
        apiToken?: string;
        customEnv?: Record<string, string>;
      };
      projectId?: string;
    } = await request.json();

    if (!serverName || !authType) {
      return NextResponse.json(
        { error: 'Server name and auth type are required' },
        { status: 400 }
      );
    }

    // Validate credentials based on auth type
    if (authType === 'oauth' && !credentials.accessToken) {
      return NextResponse.json(
        { error: 'OAuth access token is required' },
        { status: 400 }
      );
    }
    if (authType === 'api_key' && !credentials.apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }
    if (authType === 'api_token' && !credentials.apiToken) {
      return NextResponse.json(
        { error: 'API token is required' },
        { status: 400 }
      );
    }

    // Test connection before storing (skip for OAuth as token is already validated)
    if (authType !== 'oauth') {
      try {
        await mcpClientManager.connect(serverName, credentials);
      } catch (error: any) {
        return NextResponse.json(
          { error: `Connection test failed: ${error.message}` },
          { status: 400 }
        );
      }
    }

    // Store connection
    const connectionId = await storeMCPConnection(
      user.id,
      serverName,
      authType,
      credentials,
      projectId
    );

    return NextResponse.json({
      success: true,
      connectionId,
      message: 'MCP connection stored successfully',
    });
  } catch (error: any) {
    console.error('MCP connection store error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to store connection' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove MCP connection
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const serverName = searchParams.get('serverName');

    if (!serverName) {
      return NextResponse.json(
        { error: 'Server name is required' },
        { status: 400 }
      );
    }

    await deleteMCPConnection(user.id, serverName);

    return NextResponse.json({
      success: true,
      message: 'Connection deleted successfully',
    });
  } catch (error: any) {
    console.error('MCP connection delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete connection' },
      { status: 500 }
    );
  }
}

