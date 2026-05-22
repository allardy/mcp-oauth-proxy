export type RateLimiterOptions = {
  rpm: number
  now?: () => number
}

type Bucket = {
  tokens: number
  lastRefillMs: number
}

export const createRateLimiter = (opts: RateLimiterOptions) => {
  const buckets = new Map<string, Bucket>()
  const refillPerMs = opts.rpm / 60_000
  const capacity = opts.rpm
  const now = opts.now ?? (() => Date.now())

  return {
    tryConsume: (key: string): boolean => {
      const t = now()
      const bucket = buckets.get(key) ?? { tokens: capacity, lastRefillMs: t }
      const elapsed = t - bucket.lastRefillMs
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs)
      bucket.lastRefillMs = t
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1
        buckets.set(key, bucket)
        return true
      }
      buckets.set(key, bucket)
      return false
    },
  }
}
