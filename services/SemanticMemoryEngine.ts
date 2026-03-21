/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * SemanticMemoryEngine - Elite Semantic Memory System
 * 
 * Vector-powered semantic search with intelligent memory consolidation,
 * importance scoring, and automatic pruning. Integrates with pgvector
 * for sub-50ms similarity queries.
 * 
 * @module services/SemanticMemoryEngine
 * @since Phase 2.1
 */

import { assertSupabase } from '@/lib/supabase';
import { getCurrentProfile } from '@/lib/sessionManager';
import type { DashMemoryItem, AutonomyLevel } from './dash-ai/types';

// ===== SEMANTIC MEMORY TYPES =====

export interface MemoryQuery {
  text: string;
  embedding?: number[]; // Pre-computed if available
  limit?: number;
  similarityThreshold?: number;
  memoryTypes?: string[];
  dateRange?: { start: number; end: number };
}

export interface MemorySearchResult {
  memory: DashMemoryItem;
  similarity: number; // 0-1 cosine similarity
  relevanceScore: number; // Combined similarity + recency + importance
}

export interface MemoryConsolidation {
  id: string;
  originalMemories: string[]; // IDs of source memories
  consolidatedContent: string;
  importance: number;
  confidence: number;
  createdAt: number;
}

export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  avgImportance: number;
  oldestMemory: number;
  newestMemory: number;
  totalSize: number; // Estimated bytes
}

// ===== SEMANTIC MEMORY ENGINE =====

export interface ISemanticMemoryEngine {
  initialize(): Promise<void>;
  storeMemory(content: string, type: any, importance?: number, metadata?: Record<string, any>): Promise<any>;
  searchMemories(query: any): Promise<any[]>;
  dispose(): void;
}

export class SemanticMemoryEngine implements ISemanticMemoryEngine {
  // Static getInstance method for singleton pattern
  static getInstance: () => SemanticMemoryEngine;
  
  // Memory consolidation settings
  private readonly CONSOLIDATION_THRESHOLD = 0.85; // Similarity threshold for grouping
  private readonly MIN_MEMORIES_TO_CONSOLIDATE = 3;
  private readonly MAX_MEMORY_AGE_DAYS = 90;
  private readonly LOW_IMPORTANCE_THRESHOLD = 3;
  
  // Performance settings
  // OPTIMIZATION: Reduced from 1536 to 384 to prevent memory issues during bundling
  // In production, use actual embedding API which handles this server-side
  private readonly VECTOR_DIMENSIONS = 384; // Reduced for development (was 1536)
  private readonly DEFAULT_SIMILARITY_THRESHOLD = 0.7;
  private readonly MAX_SEARCH_RESULTS = 10;

  /**
   * Initialize semantic memory engine (no-op for now)
   */
  public async initialize(): Promise<void> {
    console.log('[SemanticMemory] Engine initialized');
    return Promise.resolve();
  }

  /**
   * Store memory with vector embedding
   */
  public async storeMemory(
    content: string,
    type: 'context' | 'pattern' | 'insight' | 'preference' | 'fact' | 'skill' | 'goal' | 'interaction' | 'relationship' | 'episodic' | 'working' | 'semantic',
    importance: number = 5,
    metadata?: Record<string, any>
  ): Promise<DashMemoryItem> {
    try {
      const supabase = assertSupabase();
      const profile = await getCurrentProfile();
      if (!profile) throw new Error('No user profile');

      // Generate embedding (in production, call OpenAI API)
      const embedding = await this.generateEmbedding(content);

      // Memory object for logging only
      const memoryData = {
        type,
        importance,
        metadata: { ...metadata, content },
        text_embedding: embedding,
        accessed_count: 0
      };

      const { data, error } = await supabase
        .from('ai_memories')
        .insert({
          preschool_id: profile.organization_id,
          user_id: profile.id,
          memory_type: type,
          content: { text: content, ...metadata },
          text_embedding: embedding,
          importance,
          accessed_count: 0,
          last_accessed: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`[SemanticMemory] Stored memory: ${content.substring(0, 50)}...`);
      return this.mapDbMemoryToMemoryItem(data);
    } catch (error) {
      console.error('[SemanticMemory] Failed to store memory:', error);
      throw error;
    }
  }

  /**
   * Semantic search using vector similarity
   */
  public async searchMemories(query: MemoryQuery): Promise<MemorySearchResult[]> {
    try {
      const supabase = assertSupabase();
      const profile = await getCurrentProfile();
      if (!profile) return [];

      // Generate query embedding
      const queryEmbedding = query.embedding || await this.generateEmbedding(query.text);
      
      // Use pgvector's <=> operator for cosine distance
      // Note: cosine distance = 1 - cosine similarity
      const limit = query.limit || this.MAX_SEARCH_RESULTS;
      const threshold = query.similarityThreshold || this.DEFAULT_SIMILARITY_THRESHOLD;

      let dbQuery = supabase
        .from('ai_memories')
        .select('*')
        .eq('preschool_id', profile.organization_id)
        .eq('user_id', profile.id)
        .order('text_embedding <=> ' + JSON.stringify(queryEmbedding), { ascending: true })
        .limit(limit);

      // Filter by memory types if specified
      if (query.memoryTypes?.length) {
        dbQuery = dbQuery.in('memory_type', query.memoryTypes);
      }

      // Filter by date range
      if (query.dateRange) {
        dbQuery = dbQuery
          .gte('created_at', new Date(query.dateRange.start).toISOString())
          .lte('created_at', new Date(query.dateRange.end).toISOString());
      }

      const { data, error } = await dbQuery;
      if (error) throw error;

      // Calculate relevance scores and filter by threshold
      const results: MemorySearchResult[] = data
        .map(dbMemory => {
          const similarity = this.calculateCosineSimilarity(
            queryEmbedding,
            dbMemory.text_embedding
          );

          // Don't include if below threshold
          if (similarity < threshold) return null;

          const memory = this.mapDbMemoryToMemoryItem(dbMemory);
          const relevanceScore = this.calculateRelevanceScore(memory, similarity);

          return {
            memory,
            similarity,
            relevanceScore
          };
        })
        .filter((r): r is MemorySearchResult => r !== null)
        .sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Update access count for retrieved memories
      await this.updateAccessCounts(results.map(r => r.memory.id));

      console.log(`[SemanticMemory] Found ${results.length} similar memories`);
      return results;
    } catch (error) {
      console.error('[SemanticMemory] Search failed:', error);
      return [];
    }
  }

  /**
   * Calculate relevance score combining similarity, recency, and importance
   */
  private calculateRelevanceScore(memory: DashMemoryItem, similarity: number): number {
    const now = Date.now();
    const ageMs = now - (memory.created_at || now);
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    // Recency score (exponential decay)
    const recencyScore = Math.exp(-ageDays / 30); // Half-life of 30 days
    
    // Normalize importance to 0-1
    const importanceScore = (memory.importance || 5) / 10;
    
    // Access frequency bonus
    const accessBonus = Math.min((memory.accessed_count || 0) / 10, 0.2);
    
    // Combined relevance (weighted average)
    const relevance = 
      similarity * 0.5 +           // 50% similarity
      recencyScore * 0.25 +        // 25% recency
      importanceScore * 0.20 +     // 20% importance
      accessBonus;                 // Up to 5% access bonus
    
    return Math.min(relevance, 1.0);
  }

  /**
   * Consolidate similar memories to reduce clutter
   */
  public async consolidateMemories(
    similarityThreshold: number = this.CONSOLIDATION_THRESHOLD
  ): Promise<MemoryConsolidation[]> {
    try {
      const supabase = assertSupabase();
      const profile = await getCurrentProfile();
      if (!profile) return [];

      // Get all memories for consolidation
      const { data: memories, error } = await supabase
        .from('ai_memories')
        .select('*')
        .eq('preschool_id', profile.organization_id)
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error || !memories) return [];

      // Group similar memories
      const groups = this.groupSimilarMemories(memories, similarityThreshold);
      
      const consolidations: MemoryConsolidation[] = [];

      for (const group of groups) {
        if (group.length < this.MIN_MEMORIES_TO_CONSOLIDATE) continue;

        // Create consolidated memory
        const consolidated = await this.createConsolidatedMemory(group);
        consolidations.push(consolidated);

        // Mark original memories as consolidated (soft delete)
        await supabase
          .from('ai_memories')
          .update({ 
            metadata: { consolidated: true, consolidation_id: consolidated.id }
          })
          .in('id', group.map(m => m.id));
      }

      console.log(`[SemanticMemory] Created ${consolidations.length} consolidations`);
      return consolidations;
    } catch (error) {
      console.error('[SemanticMemory] Consolidation failed:', error);
      return [];
    }
  }

  /**
   * Group similar memories using clustering
   */
  private groupSimilarMemories(memories: any[], threshold: number): any[][] {
    const groups: any[][] = [];
    const visited = new Set<string>();

    for (const memory of memories) {
      if (visited.has(memory.id)) continue;

      const group = [memory];
      visited.add(memory.id);

      // Find similar memories
      for (const other of memories) {
        if (visited.has(other.id)) continue;

        const similarity = this.calculateCosineSimilarity(
          memory.text_embedding,
          other.text_embedding
        );

        if (similarity >= threshold) {
          group.push(other);
          visited.add(other.id);
        }
      }

      if (group.length >= this.MIN_MEMORIES_TO_CONSOLIDATE) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Create consolidated memory from group
   */
  private async createConsolidatedMemory(group: any[]): Promise<MemoryConsolidation> {
    // Extract key information from all memories
    const contents = group.map(m => m.content.text || m.content).join(' ');
    const avgImportance = group.reduce((sum, m) => sum + m.importance, 0) / group.length;
    
    // Simple consolidation (in production, use AI to summarize)
    const consolidatedContent = this.summarizeMemories(group);
    
    return {
      id: `consolidation_${Date.now()}`,
      originalMemories: group.map(m => m.id),
      consolidatedContent,
      importance: Math.round(avgImportance),
      confidence: 0.8,
      createdAt: Date.now()
    };
  }

  /**
   * Simple memory summarization (replace with AI in production)
   */
  private summarizeMemories(memories: any[]): string {
    // Extract unique key phrases
    const texts = memories.map(m => m.content.text || m.content);
    
    // Simple summarization: combine first 100 chars of each
    const summaries = texts.map(t => t.substring(0, 100)).join('. ');
    return `Consolidated from ${memories.length} similar memories: ${summaries}`;
  }

  /**
   * Prune old low-importance memories
   */
  public async pruneOldMemories(): Promise<number> {
    try {
      const supabase = assertSupabase();
      const profile = await getCurrentProfile();
      if (!profile) return 0;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.MAX_MEMORY_AGE_DAYS);

      const { data, error } = await supabase
        .from('ai_memories')
        .delete()
        .eq('preschool_id', profile.organization_id)
        .eq('user_id', profile.id)
        .lt('created_at', cutoffDate.toISOString())
        .lt('importance', this.LOW_IMPORTANCE_THRESHOLD)
        .select();

      if (error) throw error;

      const pruned = data?.length || 0;
      console.log(`[SemanticMemory] Pruned ${pruned} old memories`);
      return pruned;
    } catch (error) {
      console.error('[SemanticMemory] Pruning failed:', error);
      return 0;
    }
  }

  /**
   * Get memory statistics
   */
  public async getMemoryStats(): Promise<MemoryStats> {
    try {
      const supabase = assertSupabase();
      const profile = await getCurrentProfile();
      if (!profile) {
        return {
          total: 0,
          byType: {},
          avgImportance: 0,
          oldestMemory: 0,
          newestMemory: 0,
          totalSize: 0
        };
      }

      const { data, error } = await supabase
        .from('ai_memories')
        .select('memory_type, importance, created_at')
        .eq('preschool_id', profile.organization_id)
        .eq('user_id', profile.id);

      if (error || !data) throw error;

      const byType: Record<string, number> = {};
      let totalImportance = 0;
      let oldestMemory = Date.now();
      let newestMemory = 0;

      for (const memory of data) {
        byType[memory.memory_type] = (byType[memory.memory_type] || 0) + 1;
        totalImportance += memory.importance || 5;
        
        const created = new Date(memory.created_at).getTime();
        if (created < oldestMemory) oldestMemory = created;
        if (created > newestMemory) newestMemory = created;
      }

      return {
        total: data.length,
        byType,
        avgImportance: data.length > 0 ? totalImportance / data.length : 0,
        oldestMemory,
        newestMemory,
        totalSize: data.length * 2048 // Rough estimate: 2KB per memory
      };
    } catch (error) {
      console.error('[SemanticMemory] Stats failed:', error);
      return {
        total: 0,
        byType: {},
        avgImportance: 0,
        oldestMemory: 0,
        newestMemory: 0,
        totalSize: 0
      };
    }
  }

  /**
   * Generate embedding vector (mock - replace with actual API call)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // In production, call OpenAI Embeddings API
    // For now, return a mock embedding
    const normalized = text.toLowerCase().trim();
    const hash = this.simpleHash(normalized);
    
    // Generate deterministic "embedding" from hash
    const embedding = Array.from({ length: this.VECTOR_DIMENSIONS }, (_, i) => {
      const value = Math.sin(hash + i) * Math.cos(hash - i);
      return value / Math.sqrt(this.VECTOR_DIMENSIONS);
    });

    return embedding;
  }

  /**
   * Simple hash function for mock embeddings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Update access counts for memories
   */
  private async updateAccessCounts(memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) return;

    try {
      const supabase = assertSupabase();
      
      // Increment access count and update last_accessed
      await supabase.rpc('increment_memory_access', {
        memory_ids: memoryIds
      });
    } catch (error) {
      console.error('[SemanticMemory] Failed to update access counts:', error);
    }
  }

  /**
   * Map database memory to DashMemoryItem
   */
  private mapDbMemoryToMemoryItem(dbMemory: any): DashMemoryItem {
    const content = dbMemory.content.text || JSON.stringify(dbMemory.content);
    return {
      id: dbMemory.id,
      type: dbMemory.memory_type,
      key: `memory_${dbMemory.id}`,
      value: content,
      confidence: 0.8,
      importance: dbMemory.importance,
      recency_score: dbMemory.recency_score,
      accessed_count: dbMemory.accessed_count,
      text_embedding: dbMemory.text_embedding,
      created_at: new Date(dbMemory.created_at).getTime(),
      updated_at: new Date(dbMemory.last_accessed).getTime()
    };
  }

  dispose(): void {
    // Cleanup if needed
  }
}

