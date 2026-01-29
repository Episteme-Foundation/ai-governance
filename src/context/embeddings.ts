import OpenAI from 'openai';

/**
 * Interface for embedding providers
 */
export interface EmbeddingProvider {
  /**
   * Generate an embedding vector for text
   * @param text - Text to embed
   * @returns Embedding vector
   */
  embed(text: string): Promise<number[]>;

  /**
   * Get the dimension of embeddings produced by this provider
   */
  getDimension(): number;
}

/**
 * OpenAI embeddings provider
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly dimension: number;

  constructor(apiKey?: string, model: string = 'text-embedding-3-small') {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    this.model = model;

    // text-embedding-3-small produces 1536-dimensional vectors
    this.dimension = model === 'text-embedding-3-small' ? 1536 : 1536;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });

    return response.data[0].embedding;
  }

  getDimension(): number {
    return this.dimension;
  }
}

/**
 * Embeddings service for generating and caching embeddings
 */
export class EmbeddingsService {
  private cache = new Map<string, number[]>();

  constructor(private readonly provider: EmbeddingProvider) {}

  /**
   * Generate an embedding for text, with caching
   * @param text - Text to embed
   * @returns Embedding vector
   */
  async embed(text: string): Promise<number[]> {
    // Check cache
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

    // Generate embedding
    const embedding = await this.provider.embed(text);

    // Cache it
    this.cache.set(text, embedding);

    return embedding;
  }

  /**
   * Get the dimension of embeddings
   */
  getDimension(): number {
    return this.provider.getDimension();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
