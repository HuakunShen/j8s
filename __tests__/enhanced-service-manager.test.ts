import { describe, it, expect, beforeEach } from "vitest";
import { Effect } from "effect";
import { EnhancedServiceManager, BaseEffectService, BaseService } from "../index";
import type { HealthCheckResult, IService } from "../src/interface";
import { ServiceErrorType } from "../src/errors";

class TestEffectService extends BaseEffectService implements IService {
  readonly name = "test-effect-service";
  private isRunning = false;
  private shouldFail = false;

  setShouldFail(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  startEffect() {
    return Effect.gen(this, function* () {
      if (this.shouldFail) {
        return yield* Effect.fail(new Error("Failed to start"));
      }
      this.isRunning = true;
      return yield* Effect.logInfo("Test service started");
    });
  }

  stopEffect() {
    return Effect.gen(this, function* () {
      if (this.shouldFail) {
        return yield* Effect.fail(new Error("Failed to stop"));
      }
      this.isRunning = false;
      return yield* Effect.logInfo("Test service stopped");
    });
  }

  healthCheckEffect() {
    return Effect.gen(this, function* () {
      if (this.shouldFail) {
        return yield* Effect.fail(new Error("Health check failed"));
      }
      return {
        status: this.isRunning ? "running" : "stopped",
        details: { test: true },
      } as HealthCheckResult;
    });
  }

  // Implement IService interface
  async start(): Promise<void> {
    await Effect.runPromise(this.startEffect());
  }

  async stop(): Promise<void> {
    await Effect.runPromise(this.stopEffect());
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return await Effect.runPromise(this.healthCheckEffect());
  }
}

class TestEffectService2 extends BaseEffectService implements IService {
  readonly name = "test-effect-service-2";
  private isRunning = false;

  startEffect() {
    return Effect.gen(this, function* () {
      this.isRunning = true;
      return yield* Effect.logInfo("Test service 2 started");
    });
  }

  stopEffect() {
    return Effect.gen(this, function* () {
      this.isRunning = false;
      return yield* Effect.logInfo("Test service 2 stopped");
    });
  }

  healthCheckEffect() {
    return Effect.gen(this, function* () {
      return {
        status: this.isRunning ? "running" : "stopped",
        details: { test: true },
      } as HealthCheckResult;
    });
  }

  // Implement IService interface
  async start(): Promise<void> {
    await Effect.runPromise(this.startEffect());
  }

  async stop(): Promise<void> {
    await Effect.runPromise(this.stopEffect());
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return await Effect.runPromise(this.healthCheckEffect());
  }
}

describe("EnhancedServiceManager", () => {
  let manager: EnhancedServiceManager;
  let service: TestEffectService;

  beforeEach(() => {
    manager = new EnhancedServiceManager();
    service = new TestEffectService();
  });

  it("should add and start a service", async () => {
    await Effect.runPromise(manager.addService(service));
    await Effect.runPromise(manager.startService(service.name));
    
    const health = await Effect.runPromise(manager.healthCheckService(service.name)) as HealthCheckResult;
    expect(health.status).toBe("running");
  });

  it("should stop a service", async () => {
    await Effect.runPromise(manager.addService(service));
    await Effect.runPromise(manager.startService(service.name));
    await Effect.runPromise(manager.stopService(service.name));
    
    const health = await Effect.runPromise(manager.healthCheckService(service.name)) as HealthCheckResult;
    expect(health.status).toBe("stopped");
  });

  it("should restart a service", async () => {
    await Effect.runPromise(manager.addService(service));
    await Effect.runPromise(manager.startService(service.name));
    await Effect.runPromise(manager.restartService(service.name));
    
    const health = await Effect.runPromise(manager.healthCheckService(service.name)) as HealthCheckResult;
    expect(health.status).toBe("running");
  });

  it("should handle service start failure", async () => {
    service.setShouldFail(true);
    await Effect.runPromise(manager.addService(service));
    
    const result = await Effect.runPromiseExit(manager.startService(service.name));
    expect(result._tag).toBe("Failure");
  });

  it("should handle service not found", async () => {
    const result = await Effect.runPromiseExit(manager.startService("non-existent-service"));
    expect(result._tag).toBe("Failure");
  });

  it("should get service metrics", async () => {
    await Effect.runPromise(manager.addService(service));
    await Effect.runPromise(manager.startService(service.name));
    
    const metrics = await Effect.runPromise(manager.getServiceMetrics(service.name)) as Record<string, unknown>;
    expect(metrics.name).toBe(service.name);
    expect(metrics.status).toBe("running");
    expect(metrics.totalRestarts).toBe(0);
  });

  it("should track restarts in metrics", async () => {
    await Effect.runPromise(manager.addService(service));
    await Effect.runPromise(manager.startService(service.name));
    await Effect.runPromise(manager.restartService(service.name));
    
    const metrics = await Effect.runPromise(manager.getServiceMetrics(service.name)) as Record<string, unknown>;
    expect(metrics.totalRestarts).toBe(1);
  });

  it("should health check all services", async () => {
    const service2 = new TestEffectService2();
    
    await Effect.runPromise(manager.addService(service));
    await Effect.runPromise(manager.addService(service2));
    
    await Effect.runPromise(manager.startService(service.name));
    await Effect.runPromise(manager.startService(service2.name));
    
    const healthResults = await Effect.runPromise(manager.healthCheckAllServices()) as HealthCheckResult[];
    expect(healthResults).toHaveLength(2);
    expect(healthResults[0]).toBeDefined();
    expect(healthResults[1]).toBeDefined();
    expect(healthResults[0]?.status).toBe("running");
    expect(healthResults[1]?.status).toBe("running");
  });

  it("should get all services metrics", async () => {
    const service2 = new TestEffectService2();
    
    await Effect.runPromise(manager.addService(service));
    await Effect.runPromise(manager.addService(service2));
    
    await Effect.runPromise(manager.startService(service.name));
    await Effect.runPromise(manager.startService(service2.name));
    
    const metrics = await Effect.runPromise(manager.getAllServicesMetrics()) as Record<string, unknown>[];
    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toBeDefined();
    expect(metrics[1]).toBeDefined();
    expect(metrics[0]?.name).toBe(service.name);
    expect(metrics[1]?.name).toBe(service2.name);
  });
});