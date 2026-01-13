/**
 * API route for project management
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

/**
 * GET - List all projects for user
 */
export async function GET(request: NextRequest) {
  try {
    // Create Supabase client and get user in parallel if possible
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Optimize query: only select needed fields, limit results
    // Use Promise.all if we need to fetch additional data in the future
    const projects = await prisma.project.findMany({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        repoUrl: true,
        createdAt: true,
        // Exclude userId and other unnecessary fields to reduce payload
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100, // Limit to 100 most recent projects
    });

    // Add cache headers for better performance (5 minutes)
    return NextResponse.json(
      { projects },
      {
        headers: {
          'Cache-Control': 'private, max-age=300', // 5 minutes
        },
      }
    );
  } catch (error: any) {
    console.error('Projects fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new project
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

    const { name, description, repoUrl } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name,
        description,
        repoUrl,
      },
    });

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error: any) {
    console.error('Project creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create project' },
      { status: 500 }
    );
  }
}

