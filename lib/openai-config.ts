/**
 * OpenAI Configuration
 * Centralized model configuration
 */

export const OPENAI_CONFIG = {
  // Main model for chat completions
  CHAT_MODEL: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
  
  // Embedding model for vector search
  EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  
  // Embedding dimensions
  EMBEDDING_DIMS: parseInt(process.env.OPENAI_EMBEDDING_DIMS || '1536'),
};

/**
 * Check if a model supports custom temperature values
 * Models like o1, o3 only support default temperature (1)
 */
export function supportsTemperature(model: string): boolean {
  const modelLower = model.toLowerCase();
  // Models that don't support custom temperature
  const noTempModels = ['o1', 'o1-preview', 'o1-mini', 'o3', 'o3-mini'];
  return !noTempModels.some(noTemp => modelLower.includes(noTemp));
}

/**
 * Get temperature parameter for a model
 * Always returns 1 as requested
 */
export function getTemperature(model: string, desiredTemp: number = 1): number {
  return 1;
}

/**
 * Removed max_tokens support - no longer used
 * All models will use default token limits
 */

