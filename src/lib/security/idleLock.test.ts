import { describe, expect, it } from "vitest"

import { createIdleTracker } from "@/lib/security/idleLock"

describe("createIdleTracker", () => {
  it("goes idle after the deadline and resets on activity", () => {
    let t = 0
    const tracker = createIdleTracker(10_000, () => t)
    t = 9_999
    expect(tracker.isIdle()).toBe(false)
    tracker.touch()
    t = 19_998
    expect(tracker.isIdle()).toBe(false)
    t = 19_999
    expect(tracker.isIdle()).toBe(true)
  })
})
