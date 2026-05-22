import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../src/rate-limit.js'

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ rpm: 5 })
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume('user-a')).toBe(true)
    }
  })

  it('blocks requests over the limit per key', () => {
    const limiter = createRateLimiter({ rpm: 2 })
    expect(limiter.tryConsume('user-a')).toBe(true)
    expect(limiter.tryConsume('user-a')).toBe(true)
    expect(limiter.tryConsume('user-a')).toBe(false)
  })

  it('isolates keys', () => {
    const limiter = createRateLimiter({ rpm: 1 })
    expect(limiter.tryConsume('user-a')).toBe(true)
    expect(limiter.tryConsume('user-a')).toBe(false)
    expect(limiter.tryConsume('user-b')).toBe(true)
  })

  it('refills over time', async () => {
    const limiter = createRateLimiter({ rpm: 60, now: () => Date.now() })
    expect(limiter.tryConsume('user-a')).toBe(true)
    // Burst the bucket
    for (let i = 0; i < 100; i++) limiter.tryConsume('user-a')
    expect(limiter.tryConsume('user-a')).toBe(false)
    await new Promise((r) => setTimeout(r, 1100))
    // After ~1s at 60rpm = 1/s, one token should be back.
    expect(limiter.tryConsume('user-a')).toBe(true)
  })
})
