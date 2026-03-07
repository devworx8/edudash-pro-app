/**
 * Request Throttler for Dash AI
 * 
 * Prevents hitting Anthropic API rate limits (5 requests/minute on free tier)
 * by queuing requests and enforcing minimum intervals between calls.
 */

class RequestThrottler {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly MIN_INTERVAL_MS = 12000; // 12 seconds = 5 requests/minute max

  /**
   * Enqueue a request function to be executed with rate limiting
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          // Wait if needed to respect rate limit
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          
          if (timeSinceLastRequest < this.MIN_INTERVAL_MS) {
            const waitTime = this.MIN_INTERVAL_MS - timeSinceLastRequest;
            
            // Only log in development
            if (process.env.NODE_ENV === 'development') {
              console.log(`[Throttle] Waiting ${Math.round(waitTime / 1000)}s to respect rate limit`);
            }
            
            await new Promise(r => setTimeout(r, waitTime));
          }

          this.lastRequestTime = Date.now();
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued requests sequentially
   */
  private async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const task = this.queue.shift()!;
    
    try {
      await task();
    } catch (error) {
      // Error already handled in enqueue
    }
    
    // Process next request
    this.processQueue();
  }

  /**
   * Get current queue length (useful for UI indicators)
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Check if a request would need to wait
   */
  wouldWait(): boolean {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    return timeSinceLastRequest < this.MIN_INTERVAL_MS;
  }

  /**
   * Get estimated wait time in milliseconds
   */
  getWaitTime(): number {
    if (!this.wouldWait()) return 0;
    return Math.max(0, this.MIN_INTERVAL_MS - (Date.now() - this.lastRequestTime));
  }
}

// Singleton instance
export const dashAIThrottler = new RequestThrottler();

// Export for testing
export { RequestThrottler };
