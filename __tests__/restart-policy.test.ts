import { describe, expect, it } from "bun:test";
import { Duration, Effect } from "effect";
import { ServiceManager } from "../index";
import type { HealthCheckResult, IService } from "../src/interface";

class MockService implements IService {
  public failCount = 0;
  public startCalls = 0;
  private shouldFail = false;
  private failTimes = 0;

  constructor(public readonly name: string) {}

  public setFailure(shouldFail: boolean, failTimes: number = Infinity): void {
    this.shouldFail = shouldFail;
    this.failTimes = failTimes;
    this.failCount = 0;
  }

  public start(): Effect.Effect<void, unknown> {
    const self = this;
    return Effect.gen(function* () {
      self.startCalls++;

      if (self.shouldFail && self.failCount < self.failTimes) {
        self.failCount++;
        yield* Effect.fail(
          new Error(
            `Service ${self.name} failed to start (attempt ${self.failCount})`
          )
        );
      }

      yield* Effect.never;
    });
  }

  public stop(): Effect.Effect<void, unknown> {
    return Effect.void;
  }

  public healthCheck(): Effect.Effect<HealthCheckResult, unknown> {
    return Effect.succeed({
      status: "stopped",
      details: {
        failCount: this.failCount,
        startCalls: this.startCalls,
      },
    });
  }
}

class CompletingService implements IService {
  public starts = 0;
  constructor(public readonly name: string) {}

  public start(): Effect.Effect<void, unknown> {
    this.starts++;
    return Effect.void;
  }

  public stop(): Effect.Effect<void, unknown> {
    return Effect.void;
  }

  public healthCheck(): Effect.Effect<HealthCheckResult, unknown> {
    return Effect.succeed({ status: "stopped" });
  }
}

describe("ServiceManager - Restart Policy", () => {
  it('should not restart service when policy is "no"', async () => {
    const manager = new ServiceManager({ backoffBaseMs: 5, backoffMaxMs: 5 });
    const service = new MockService("no-restart");
    service.setFailure(true, 1);

    manager.addService(service, {
      restartPolicy: "no",
    });

    try {
      await Effect.runPromise(manager.startService("no-restart"));
    } catch {
      // expected failure
    }

    const health: HealthCheckResult = await Effect.runPromise(
      manager.healthCheckService("no-restart")
    );

    expect(health.status).toBe("crashed");
    expect(service.startCalls).toBe(1);
  });

  it("service restarts respect maxRetries", async () => {
    const manager = new ServiceManager({ backoffBaseMs: 5, backoffMaxMs: 5 });
    const service = new MockService("max-retries");
    service.setFailure(true, 10);

    manager.addService(service, {
      restartPolicy: "on-failure",
      maxRetries: 2,
    });

    try {
      await Effect.runPromise(manager.startService("max-retries"));
    } catch {
      // expected
    }

    await Effect.runPromise(Effect.sleep(Duration.millis(40)));

    const health: HealthCheckResult = await Effect.runPromise(
      manager.healthCheckService("max-retries")
    );

    expect(service.startCalls).toBe(3);
    expect(health.status).toBe("crashed");
  });

  it("should reset restart count after successful start", async () => {
    const manager = new ServiceManager({ backoffBaseMs: 5, backoffMaxMs: 5 });
    const service = new MockService("reset-count");
    service.setFailure(true, 1);

    manager.addService(service, {
      restartPolicy: "on-failure",
      maxRetries: 3,
    });

    try {
      await Effect.runPromise(manager.startService("reset-count"));
    } catch {
      // expected
    }

    await Effect.runPromise(Effect.sleep(Duration.millis(40)));

    let health: HealthCheckResult = await Effect.runPromise(
      manager.healthCheckService("reset-count")
    );
    expect(health.status).toBe("running");

    service.setFailure(true, 1);
    await Effect.runPromise(manager.stopService("reset-count"));

    try {
      await Effect.runPromise(manager.startService("reset-count"));
    } catch {
      // expected
    }

    await Effect.runPromise(Effect.sleep(Duration.millis(40)));

    health = await Effect.runPromise(manager.healthCheckService("reset-count"));
    expect(health.status).toBe("running");
  });

  it("allows short-lived services to complete without throwing", async () => {
    const manager = new ServiceManager();
    const service = new CompletingService("short-lived");

    manager.addService(service, { restartPolicy: "no" });

    await expect(
      Effect.runPromise(manager.startService("short-lived"))
    ).resolves.toBeUndefined();

    const health: HealthCheckResult = await Effect.runPromise(
      manager.healthCheckService("short-lived")
    );
    expect(health.status).toBe("stopped");
    expect(service.starts).toBe(1);
  });

  it('restarts services with policy "always" after completion', async () => {
    const manager = new ServiceManager({ backoffBaseMs: 5, backoffMaxMs: 5 });
    const service = new CompletingService("always-service");

    manager.addService(service, { restartPolicy: "always" });

    await Effect.runPromise(manager.startService("always-service"));
    await Effect.runPromise(Effect.sleep(Duration.millis(40)));

    expect(service.starts).toBeGreaterThanOrEqual(2);

    await Effect.runPromise(manager.stopService("always-service"));
    const health: HealthCheckResult = await Effect.runPromise(
      manager.healthCheckService("always-service")
    );
    expect(health.status).toBe("stopped");
  });
});
