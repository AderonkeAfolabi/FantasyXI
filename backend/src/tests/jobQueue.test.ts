import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeLockTime, LOCK_LEAD_MINUTES } from "../jobs/deadlineLocking.js";
import { isGameweekReadyForSettlement } from "../jobs/gameweekSettlement.js";
import { runWithMetrics, getQueueHealth, JOB_DEFINITIONS } from "../queues/jobQueue.js";

describe("Background Job Queue & Matchday Lifecycle", () => {
  it("locks squads 90 minutes before the first kickoff", () => {
    assert.equal(LOCK_LEAD_MINUTES, 90);
    const lock = computeLockTime(new Date("2026-09-12T11:30:00Z"));
    assert.equal(lock.toISOString(), "2026-09-12T10:00:00.000Z");
  });

  it("settles a gameweek only when every fixture is finished", () => {
    assert.equal(isGameweekReadyForSettlement([]), false);
    assert.equal(isGameweekReadyForSettlement([{ finished: true }, { finished: false }]), false);
    assert.equal(isGameweekReadyForSettlement([{ finished: true }, { finished: true }]), true);
  });

  it("schedules polling every minute and all lifecycle jobs", () => {
    const byName = new Map(JOB_DEFINITIONS.map((d) => [d.name, d.cron]));
    assert.equal(byName.get("matchday-poll"), "* * * * *");
    assert.equal(byName.get("deadline-lock"), "* * * * *");
    assert.ok(byName.has("gameweek-settlement"));
    assert.ok(byName.has("league-refunds"));
  });

  it("records success, failure and retry metrics", async () => {
    let shouldFail = true;
    const def = {
      name: "matchday-poll",
      cron: "* * * * *",
      handler: async () => {
        if (shouldFail) throw new Error("FPL API down");
      },
    };

    const originalError = console.error;
    const originalLog = console.log;
    console.error = () => {};
    console.log = () => {};
    try {
      await assert.rejects(() => runWithMetrics(def, 0), /FPL API down/);
      shouldFail = false;
      await runWithMetrics(def, 1);
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }

    const health = await getQueueHealth();
    assert.equal(health.running, false);
    const poll = health.queues.find((q) => q.name === "matchday-poll")!;
    assert.equal(poll.processed, 2);
    assert.equal(poll.failed, 1);
    assert.equal(poll.succeeded, 1);
    assert.equal(poll.retried, 1);
    assert.equal(poll.lastError, "FPL API down");
  });
});
