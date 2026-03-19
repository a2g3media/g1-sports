/**
 * AI Call Optimization Layer
 * 
 * Provides debouncing, deduplication, and in-flight request tracking
 * for AI calls to prevent redundant API requests.
 * 
 * Usage:
 *   const optimizer = createAICallOptimizer();
 *   const result = await optimizer.call(fetchFn, requestPayload);
 */

// Simple hash function for request deduplication
function hashPayload(payload: unknown): string {
  return JSON.stringify(payload);
}

// Dev-only logging
const isDev = import.meta.env.DEV;
function devLog(message: string, data?: unknown) {
  if (isDev) {
    console.log(`[AI Optimizer] ${message}`, data ?? "");
  }
}

interface InFlightRequest {
  hash: string;
  promise: Promise<unknown>;
  timestamp: number;
}

interface OptimizerOptions {
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Prevent identical consecutive calls (default: true) */
  deduplicateConsecutive?: boolean;
  /** Reuse in-flight requests with same payload (default: true) */
  reuseInFlight?: boolean;
  /** Cache TTL in ms for identical requests (default: 0 = no cache) */
  cacheTtlMs?: number;
}

interface AICallOptimizer {
  /**
   * Execute an AI call with optimization.
   * @param fetchFn - The async function to call
   * @param payload - The request payload (used for deduplication)
   * @returns Promise resolving to the fetch result
   */
  call: <T>(fetchFn: () => Promise<T>, payload: unknown) => Promise<T>;
  
  /**
   * Debounced version of call - delays execution and cancels previous pending calls.
   * @param fetchFn - The async function to call
   * @param payload - The request payload (used for deduplication)
   * @returns Promise resolving to the fetch result
   */
  debouncedCall: <T>(fetchFn: () => Promise<T>, payload: unknown) => Promise<T>;
  
  /**
   * Cancel any pending debounced calls.
   */
  cancelPending: () => void;
  
  /**
   * Clear the optimizer state (in-flight requests, cache, etc.)
   */
  clear: () => void;
  
  /**
   * Get statistics about prevented calls (dev only)
   */
  getStats: () => OptimizerStats;
}

interface OptimizerStats {
  totalCalls: number;
  preventedCalls: number;
  reusedInFlight: number;
  debounceCancelled: number;
}

/**
 * Creates an AI call optimizer instance.
 * Each instance tracks its own state, so create one per component/feature.
 */
export function createAICallOptimizer(options: OptimizerOptions = {}): AICallOptimizer {
  const {
    debounceMs = 300,
    deduplicateConsecutive = true,
    reuseInFlight = true,
    cacheTtlMs = 0,
  } = options;
  
  // State
  let lastCallHash: string | null = null;
  let lastCallTime = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingDebounceReject: ((reason: Error) => void) | null = null;
  const inFlightRequests = new Map<string, InFlightRequest>();
  const cache = new Map<string, { data: unknown; timestamp: number }>();
  
  // Stats (dev only)
  const stats: OptimizerStats = {
    totalCalls: 0,
    preventedCalls: 0,
    reusedInFlight: 0,
    debounceCancelled: 0,
  };
  
  function cleanupInFlight() {
    const now = Date.now();
    for (const [hash, req] of inFlightRequests) {
      // Remove requests older than 30 seconds (likely failed/timed out)
      if (now - req.timestamp > 30000) {
        inFlightRequests.delete(hash);
      }
    }
  }
  
  function cleanupCache() {
    if (cacheTtlMs <= 0) return;
    const now = Date.now();
    for (const [hash, entry] of cache) {
      if (now - entry.timestamp > cacheTtlMs) {
        cache.delete(hash);
      }
    }
  }
  
  async function call<T>(fetchFn: () => Promise<T>, payload: unknown): Promise<T> {
    stats.totalCalls++;
    const hash = hashPayload(payload);
    const now = Date.now();
    
    // Cleanup old entries
    cleanupInFlight();
    cleanupCache();
    
    // Check cache first
    if (cacheTtlMs > 0) {
      const cached = cache.get(hash);
      if (cached && now - cached.timestamp < cacheTtlMs) {
        devLog("Cache hit, returning cached result", { hash: hash.slice(0, 50) });
        stats.preventedCalls++;
        return cached.data as T;
      }
    }
    
    // Check for duplicate consecutive call (within 100ms)
    if (deduplicateConsecutive && hash === lastCallHash && now - lastCallTime < 100) {
      devLog("Prevented duplicate consecutive call", { hash: hash.slice(0, 50) });
      stats.preventedCalls++;
      
      // If there's an in-flight request, reuse it
      const inFlight = inFlightRequests.get(hash);
      if (inFlight) {
        return inFlight.promise as Promise<T>;
      }
      
      // Otherwise, throw to prevent the duplicate
      throw new Error("Duplicate AI call prevented");
    }
    
    // Check for in-flight request with same payload
    if (reuseInFlight) {
      const inFlight = inFlightRequests.get(hash);
      if (inFlight) {
        devLog("Reusing in-flight request", { hash: hash.slice(0, 50) });
        stats.reusedInFlight++;
        return inFlight.promise as Promise<T>;
      }
    }
    
    // Update tracking
    lastCallHash = hash;
    lastCallTime = now;
    
    // Execute the call and track it
    const promise = fetchFn().then(
      (result) => {
        // Cache successful result
        if (cacheTtlMs > 0) {
          cache.set(hash, { data: result, timestamp: Date.now() });
        }
        inFlightRequests.delete(hash);
        return result;
      },
      (error) => {
        inFlightRequests.delete(hash);
        throw error;
      }
    );
    
    inFlightRequests.set(hash, { hash, promise, timestamp: now });
    
    return promise;
  }
  
  function debouncedCall<T>(fetchFn: () => Promise<T>, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      // Cancel previous pending call
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        if (pendingDebounceReject) {
          stats.debounceCancelled++;
          devLog("Cancelled previous debounced call");
          pendingDebounceReject(new Error("Debounce cancelled"));
        }
      }
      
      pendingDebounceReject = reject;
      
      debounceTimer = setTimeout(async () => {
        pendingDebounceReject = null;
        debounceTimer = null;
        
        try {
          const result = await call(fetchFn, payload);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, debounceMs);
    });
  }
  
  function cancelPending() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pendingDebounceReject) {
      pendingDebounceReject(new Error("Cancelled"));
      pendingDebounceReject = null;
    }
  }
  
  function clear() {
    cancelPending();
    lastCallHash = null;
    lastCallTime = 0;
    inFlightRequests.clear();
    cache.clear();
  }
  
  function getStats(): OptimizerStats {
    return { ...stats };
  }
  
  return {
    call,
    debouncedCall,
    cancelPending,
    clear,
    getStats,
  };
}

/**
 * Global singleton optimizer for shared use across components.
 * Use this for simple cases; create separate instances for isolated tracking.
 */
let globalOptimizer: AICallOptimizer | null = null;

export function getGlobalAIOptimizer(): AICallOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = createAICallOptimizer({
      debounceMs: 300,
      deduplicateConsecutive: true,
      reuseInFlight: true,
      cacheTtlMs: 5000, // 5 second cache for identical requests
    });
  }
  return globalOptimizer;
}

/**
 * React hook for using the AI call optimizer.
 * Creates a component-scoped optimizer that cleans up on unmount.
 */
import { useRef, useEffect } from "react";

export function useAICallOptimizer(options?: OptimizerOptions): AICallOptimizer {
  const optimizerRef = useRef<AICallOptimizer | null>(null);
  
  if (!optimizerRef.current) {
    optimizerRef.current = createAICallOptimizer(options);
  }
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      optimizerRef.current?.clear();
    };
  }, []);
  
  return optimizerRef.current;
}
