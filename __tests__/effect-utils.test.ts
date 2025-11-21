import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect } from "effect";
import { RetryPolicies, ResourceManager, Concurrency, Monitoring } from "../src/EffectUtils";
import { ServiceErrorType } from "../src/errors";

describe("EffectUtils", () => {
  describe("RetryPolicies", () => {
    it("should create exponential backoff schedule", () => {
      const schedule = RetryPolicies.exponentialBackoff(3);
      expect(schedule).toBeDefined();
    });

    it("should create fixed delay schedule", () => {
      const schedule = RetryPolicies.fixedDelay(1000, 3);
      expect(schedule).toBeDefined();
    });

    it("should create progressive backoff schedule", () => {
      const schedule = RetryPolicies.progressiveBackoff(5);
      expect(schedule).toBeDefined();
    });
  });

  describe("ResourceManager", () => {
    it("should create managed service with acquire and release", async () => {
      const acquire = Effect.succeed("resource");
      const release = vi.fn().mockReturnValue(Effect.succeed(undefined));
      
      const managedEffect = ResourceManager.managedService(
        acquire,
        release,
        "test-service"
      );
      
      const result = await Effect.runPromise(managedEffect);
      expect(result).toBe("resource");
    });

    it("should timeout an effect after specified duration", async () => {
      const slowEffect = Effect.sleep(2000).pipe(Effect.map(() => "done"));
      
      const timeoutEffect = ResourceManager.withTimeout(
        slowEffect,
        100,
        "test-service",
        "slow-operation"
      );
      
      const result = await Effect.runPromiseExit(timeoutEffect);
      expect(result._tag).toBe("Failure");
    });
  });

  describe("Concurrency", () => {
    it("should run effects with limited concurrency", async () => {
      const effects = [
        Effect.succeed(1),
        Effect.succeed(2),
        Effect.succeed(3),
        Effect.succeed(4),
      ];
      
      const result = await Effect.runPromise(
        Concurrency.withConcurrency(effects, 2)
      );
      
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it("should create a semaphore", async () => {
      const semaphore = await Effect.runPromise(Concurrency.semaphore(2));
      expect(semaphore).toBeDefined();
    });
  });

  describe("Monitoring", () => {
    it("should measure duration of an effect", async () => {
      const effect = Effect.succeed("result");
      
      const result = await Effect.runPromise(
        Monitoring.measureDuration(effect, "test-service", "test-operation")
      );
      
      expect(result).toBe("result");
    });

    it("should track metrics for an effect", async () => {
      const effect = Effect.succeed("result");
      
      const result = await Effect.runPromise(
        Monitoring.trackMetrics(effect, "test-service", "test-operation")
      );
      
      expect(result).toBe("result");
    });
  });
});