/**
 * API route for agent memory management
 */

import { NextRequest, NextResponse } from 'next/server';
import { AgentMemory } from '@/lib/memory';
import { getMem0Instance } from '@/lib/memory';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const agent = searchParams.get('agent');
    const projectId = searchParams.get('projectId');
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // If projectId is provided, verify it belongs to user
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId: user.id,
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }
    }

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent name is required' },
        { status: 400 }
      );
    }

    const memory = new AgentMemory(agent, projectId || undefined);

    if (query) {
      // Search memories
      const results = await memory.recall(query, { limit });
      return NextResponse.json({ memories: results });
    } else {
      // Get all memories
      const memories = await memory.getAllMemories(limit);
      return NextResponse.json({ memories });
    }
  } catch (error: any) {
    console.error('Memory fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch memories' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { agent, projectId, content, category, metadata } = await request.json();
    
    // If projectId is provided, verify it belongs to user
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId: user.id,
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }
    }

    if (!agent || !content) {
      return NextResponse.json(
        { error: 'Agent name and content are required' },
        { status: 400 }
      );
    }

    const memory = new AgentMemory(agent, projectId);
    const memoryId = await memory.remember(content, category, metadata);

    return NextResponse.json({
      success: true,
      memoryId,
      message: 'Memory stored successfully',
    });
  } catch (error: any) {
    console.error('Memory store error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to store memory' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Authentication check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const agent = searchParams.get('agent');
    const projectId = searchParams.get('projectId');
    const memoryId = searchParams.get('memoryId');
    
    // If projectId is provided, verify it belongs to user
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId: user.id,
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }
    }

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent name is required' },
        { status: 400 }
      );
    }

    const mem0 = getMem0Instance();

    if (memoryId) {
      // Delete specific memory
      await mem0.delete(memoryId);
      return NextResponse.json({
        success: true,
        message: 'Memory deleted successfully',
      });
    } else {
      // Delete all memories for agent
      const memory = new AgentMemory(agent, projectId || undefined);
      const deleted = await memory.clearMemories();
      return NextResponse.json({
        success: true,
        deleted,
        message: `${deleted} memories deleted`,
      });
    }
  } catch (error: any) {
    console.error('Memory delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete memory' },
      { status: 500 }
    );
  }
}

