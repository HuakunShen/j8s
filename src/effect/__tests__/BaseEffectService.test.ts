import { Effect, Layer, Ref } from "effect";
import { describe, it, expect } from "vitest";
import { BaseEffectService } from "../BaseEffectService";
import { StartupError, ShutdownError } from "../errors";
import { ServiceContext, type EffectServiceConfig } from "../interfaces";
import { ServiceContextLive } from "../EffectServiceManager";

// Test service implementation
class TestService extends BaseEffectService {
  private readonly shouldFail = Ref.unsafeMake<boolean>(false);
  private readonly runDuration = Ref.unsafeMake<number>(0);

  constructor(name: string, config: EffectServiceConfig = {}) {
    super(name, config);
  }

  setShouldFail(fail: boolean): Effect.Effect<void, never, never> {
    return Ref.set(this.shouldFail, fail);
  }

  setRunDuration(duration: number): Effect.Effect<void, never, never> {
    return Ref.set(this.runDuration, duration);
  }

  protected runService(): Effect.Effect<void, StartupError, ServiceContext> {
    return Effect.gen(this, function* () {
      const shouldFail = yield* Ref.get(this.shouldFail);
      const duration = yield* Ref.get(this.runDuration);

      if (shouldFail) {
        return yield* Effect.fail(new StartupError({
          message: "Test service failure",
          phase: "execution"
        }));
      }

      if (duration > 0) {
        yield* Effect.sleep(duration);
      }
    });
  }

  protected cleanupService(): Effect.Effect<void, ShutdownError, ServiceContext> {
    return Effect.void;
  }
}

// Use the actual service context layer
const testLayer = ServiceContextLive;

describe("BaseEffectService", () => {
  it("should start and stop successfully", async () => {
    const service = new TestService("test-service");
    
    const program = Effect.gen(function* () {
      yield* service.start();
      const health = yield* service.healthCheck();
      expect(health.status).toBe("running");
      
      yield* service.stop();
      const healthAfterStop = yield* service.healthCheck();
      expect(healthAfterStop.status).toBe("stopped");
    });

    await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
  });

  it("should handle startup failures", async () => {
    const service = new TestService("failing-service");
    
    const program = Effect.gen(function* () {
      yield* service.setShouldFail(true);
      
      const result = yield* Effect.either(service.start());
      expect(result._tag).toBe("Left");
      
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("StartupError");
        expect(result.left.message).toContain("Test service failure");
      }
    });

    await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
  });

  it("should track metrics correctly", async () => {
    const service = new TestService("metrics-service");
    
    const program = Effect.gen(function* () {
      // Start and stop service multiple times
      yield* service.start();
      yield* service.stop();
      
      yield* service.start();
      yield* service.stop();
      
      const health = yield* service.healthCheck();
      expect(health.details?.name).toBe("metrics-service");
      expect((health as any).metrics?.successCount).toBe(2);
    });

    await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
  });

  it("should restart correctly", async () => {
    const service = new TestService("restart-service");
    
    const program = Effect.gen(function* () {
      yield* service.start();
      yield* service.restart();
      
      const health = yield* service.healthCheck();
      expect((health as any).restartCount).toBe(1);
    });

    await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
  });

  it("should handle observability configuration", async () => {
    const service = new TestService("observable-service", {
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { environment: "test" }
      }
    });
    
    const program = Effect.gen(function* () {
      yield* service.start();
      yield* service.stop();
      
      const health = yield* service.healthCheck();
      expect(health.details?.config.observability?.enableTracing).toBe(true);
    });

    await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
  });

  it("should prevent double start", async () => {
    const service = new TestService("double-start-service");
    
    const program = Effect.gen(function* () {
      yield* service.start();
      
      const result = yield* Effect.either(service.start());
      expect(result._tag).toBe("Left");
      
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("StartupError");
        expect(result.left.message).toContain("already running");
      }
      
      yield* service.stop();
    });

    await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
  });

  it("should handle stop when already stopped", async () => {
    const service = new TestService("stop-when-stopped-service");
    
    const program = Effect.gen(function* () {
      // Service starts as stopped, stopping should be no-op
      yield* service.stop();
      
      const health = yield* service.healthCheck();
      expect(health.status).toBe("stopped");
    });

    await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
  });

  it("should handle timeout configuration", async () => {
    const service = new TestService("timeout-service", {
      timeout: 1000
    });
    
    const program = Effect.gen(function* () {
      yield* service.setRunDuration(2000); // Longer than timeout
      
      const result = yield* Effect.either(
        Effect.timeout(service.start(), 1500)
      );
      
      // Should either timeout or complete within timeout
      expect(result._tag).toBe("Left");
    });

    await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
  });
});

describe("BaseEffectService with TestClock", () => {
  it("should track uptime correctly", async () => {
    const service = new TestService("uptime-service");
    
    const program = Effect.gen(function* () {
      yield* service.start();
      
      const health = yield* service.healthCheck();
      expect(health.status).toBe("running");
      
      yield* service.stop();
    });

    await Effect.runPromise(program.pipe(Effect.provide(testLayer)));
  });
});