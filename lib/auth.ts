/**
 * Auth utilities for API routes
 */

import { createClient } from '@/lib/supabase/server';

/**
 * Get authenticated user in API route
 * Returns user or null if not authenticated
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

