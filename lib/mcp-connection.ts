/**
 * MCP Connection Management
 * Handles OAuth and BYOK (Bring Your Own Key) authentication
 */

import { prisma } from '@/lib/db';

export interface MCPConnection {
  id: string;
  serverName: string;
  authType: 'oauth' | 'api_key' | 'api_token' | 'env';
  credentials: {
    accessToken?: string;
    apiKey?: string;
    apiToken?: string;
    customEnv?: Record<string, string>;
  };
  userId: string;
  projectId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Store MCP connection credentials
 */
export async function storeMCPConnection(
  userId: string,
  serverName: string,
  authType: 'oauth' | 'api_key' | 'api_token' | 'env',
  credentials: MCPConnection['credentials'],
  projectId?: string
): Promise<string> {
  // In production, encrypt credentials before storing
  const connection = await prisma.mCPConnection.upsert({
    where: {
      userId_serverName: {
        userId,
        serverName,
      },
    },
    update: {
      authType,
      credentials: credentials as any,
      projectId,
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      userId,
      serverName,
      authType,
      credentials: credentials as any,
      projectId,
      isActive: true,
    },
  });

  return connection.id;
}

/**
 * Get MCP connection for user
 */
export async function getMCPConnection(
  userId: string,
  serverName: string
): Promise<MCPConnection | null> {
  const connection = await prisma.mCPConnection.findUnique({
    where: {
      userId_serverName: {
        userId,
        serverName,
      },
    },
  });

  if (!connection || !connection.isActive) {
    return null;
  }

  return {
    id: connection.id,
    serverName: connection.serverName,
    authType: connection.authType as any,
    credentials: connection.credentials as any,
    userId: connection.userId,
    projectId: connection.projectId || undefined,
    isActive: connection.isActive,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

/**
 * List all MCP connections for user
 */
export async function listMCPConnections(
  userId: string,
  projectId?: string
): Promise<MCPConnection[]> {
  const connections = await prisma.mCPConnection.findMany({
    where: {
      userId,
      isActive: true,
      ...(projectId && { projectId }),
    },
  });

  return connections.map(conn => ({
    id: conn.id,
    serverName: conn.serverName,
    authType: conn.authType as any,
    credentials: conn.credentials as any,
    userId: conn.userId,
    projectId: conn.projectId || undefined,
    isActive: conn.isActive,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  }));
}

/**
 * Delete MCP connection
 */
export async function deleteMCPConnection(
  userId: string,
  serverName: string
): Promise<void> {
  await prisma.mCPConnection.update({
    where: {
      userId_serverName: {
        userId,
        serverName,
      },
    },
    data: {
      isActive: false,
    },
  });
}

