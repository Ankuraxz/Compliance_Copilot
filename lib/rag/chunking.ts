/**
 * Text Chunking Strategies for RAG
 * Implements various chunking approaches for compliance documents
 */

export interface Chunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    type: 'code' | 'documentation' | 'config' | 'requirement';
    framework?: string;
    requirementCode?: string;
    filePath?: string;
    lineNumber?: number;
    chunkIndex: number;
    totalChunks: number;
  };
}

export class ChunkingStrategy {
  /**
   * Chunk text by fixed size with overlap
   */
  static fixedSizeChunking(
    text: string,
    chunkSize: number = 1000,
    overlap: number = 200
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - overlap;
    }

    return chunks;
  }

  /**
   * Chunk by semantic boundaries (paragraphs, sections)
   */
  static semanticChunking(text: string, maxChunkSize: number = 1000): string[] {
    // Split by double newlines (paragraphs)
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Chunk code files by functions/classes
   */
  static codeChunking(
    code: string,
    language: string = 'typescript',
    maxChunkSize: number = 1000
  ): Array<{ content: string; lineStart: number; lineEnd: number }> {
    const chunks: Array<{ content: string; lineStart: number; lineEnd: number }> = [];
    const lines = code.split('\n');
    let currentChunk: string[] = [];
    let lineStart = 1;
    let braceCount = 0;
    let inFunction = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk.push(line);

      // Detect function/class boundaries
      if (line.match(/^(export\s+)?(async\s+)?(function|class|const|let|var)\s+/)) {
        if (inFunction && currentChunk.length > 1) {
          // Save previous chunk
          chunks.push({
            content: currentChunk.slice(0, -1).join('\n'),
            lineStart,
            lineEnd: i - 1,
          });
          currentChunk = [line];
          lineStart = i + 1;
        }
        inFunction = true;
      }

      // Count braces for block detection
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      // If we've closed a block and chunk is getting large
      if (braceCount === 0 && inFunction && currentChunk.length > 50) {
        chunks.push({
          content: currentChunk.join('\n'),
          lineStart,
          lineEnd: i + 1,
        });
        currentChunk = [];
        lineStart = i + 2;
        inFunction = false;
      }

      // Fallback: chunk by size
      if (currentChunk.join('\n').length > maxChunkSize) {
        chunks.push({
          content: currentChunk.join('\n'),
          lineStart,
          lineEnd: i + 1,
        });
        currentChunk = [];
        lineStart = i + 2;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.join('\n'),
        lineStart,
        lineEnd: lines.length,
      });
    }

    return chunks;
  }

  /**
   * Chunk compliance requirements by sections
   */
  static requirementChunking(
    requirement: string,
    requirementCode: string,
    framework: string
  ): Chunk[] {
    // Split by numbered sections or subsections
    const sections = requirement.split(/(?=\d+\.\s+|\*\*[A-Z]+\*\*)/);
    const chunks: Chunk[] = [];

    sections.forEach((section, index) => {
      if (section.trim()) {
        chunks.push({
          id: `${framework}-${requirementCode}-chunk-${index}`,
          content: section.trim(),
          metadata: {
            source: requirementCode,
            type: 'requirement',
            framework,
            requirementCode,
            chunkIndex: index,
            totalChunks: sections.length,
          },
        });
      }
    });

    return chunks;
  }

  /**
   * Create chunks with metadata for vector storage
   */
  static createChunks(
    content: string,
    metadata: Partial<Chunk['metadata']>,
    strategy: 'fixed' | 'semantic' | 'code' = 'semantic'
  ): Chunk[] {
    let textChunks: string[] = [];

    if (strategy === 'code' && metadata.filePath) {
      const codeChunks = this.codeChunking(content);
      return codeChunks.map((chunk, index) => ({
        id: `${metadata.source}-chunk-${index}`,
        content: chunk.content,
        metadata: {
          ...metadata,
          filePath: metadata.filePath,
          lineNumber: chunk.lineStart,
          chunkIndex: index,
          totalChunks: codeChunks.length,
        } as Chunk['metadata'],
      }));
    } else if (strategy === 'fixed') {
      textChunks = this.fixedSizeChunking(content);
    } else {
      textChunks = this.semanticChunking(content);
    }

    return textChunks.map((chunk, index) => ({
      id: `${metadata.source}-chunk-${index}`,
      content: chunk,
      metadata: {
        source: metadata.source || 'unknown',
        type: metadata.type || 'documentation',
        chunkIndex: index,
        totalChunks: textChunks.length,
        ...metadata,
      } as Chunk['metadata'],
    }));
  }
}

