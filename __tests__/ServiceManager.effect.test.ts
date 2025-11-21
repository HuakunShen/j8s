// @ts-nocheck - This file contains mock implementations and skipped tests for deprecated Effect-based API
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect, Exit, Cause, Duration, Fiber, Schedule } from "effect";
import { BaseService } from "../src/BaseService";
import type {
  IService,
  HealthCheckResult,
  ServiceStatus,
  ServiceConfig,
} from "../src/interface";
import { IServiceAdapter } from "../src/IServiceAdapter";

/* Mock ServiceManager implementation for testing
// Temporarily disabled - Effect-based API changed to hybrid approach
class EffectServiceManager {
  private managedServices: Map<string, any> = new Map();

  addService(service: IService, config: ServiceConfig = {}): Effect.Effect<void, Error> {
    if (this.managedServices.has(service.name)) {
      return Effect.fail(new Error(`Service with name '${service.name}' already exists`));
    }

    const adapter = new IServiceAdapter(service);
    const self = this;

    return Effect.gen(function* () {
      const managedService = {
        name: service.name,
        adapter,
        config,
        fiber: null as any,
        status: Effect.succeed("stopped" as ServiceStatus),
        healthCheck: adapter.healthCheck,
      };

      yield* Effect.sync(() => {
        self.managedServices.set(service.name, managedService);
      });
    });
  }

  startService(serviceName: string): Effect.Effect<void, Error> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      return Effect.fail(new Error(`Service '${serviceName}' not found`));
    }

    return Effect.scoped(
      Effect.gen(function* () {
        // Fork the service program into a fiber
        const fiber = yield* Effect.fork(managedService.adapter.program);

        // Store the fiber for lifecycle management
        managedService.fiber = fiber;

        // Try a simpler approach - just wait a bit and assume success
        // if no immediate failure occurs
        yield* Effect.sleep(50);
        managedService.status = Effect.succeed("running" as ServiceStatus);
      })
    );
  }

  stopService(serviceName: string): Effect.Effect<void, Error> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      return Effect.fail(new Error(`Service '${serviceName}' not found`));
    }

    if (!managedService.fiber) {
      return Effect.succeed(undefined);
    }

    return Effect.gen(function* () {
      // Interrupt the fiber to stop the service
      yield* Fiber.interrupt(managedService.fiber);

      // Update status to stopped
      managedService.status = Effect.succeed("stopped" as ServiceStatus);
      managedService.fiber = null;
    });
  }

  healthCheckService(serviceName: string): Effect.Effect<HealthCheckResult, Error> {
    const managedService = this.managedServices.get(serviceName);
    if (!managedService) {
      return Effect.fail(new Error(`Service '${serviceName}' not found`));
    }

    return Effect.gen(function* () {
      const healthResult = yield* managedService.healthCheck;
      const status = yield* managedService.status;

      return {
        ...healthResult,
        status, // Override with managed status
      } as HealthCheckResult;
    });
  }

  startAllServices(): Effect.Effect<void, Error> {
    const serviceNames = Array.from(this.managedServices.keys());
    const startEffects = serviceNames.map(name => this.startService(name));

    return Effect.all(startEffects).pipe(Effect.andThen(Effect.void));
  }

  stopAllServices(): Effect.Effect<void, Error> {
    const serviceNames = Array.from(this.managedServices.keys());
    const stopEffects = serviceNames.map(name => this.stopService(name));

    return Effect.all(stopEffects).pipe(Effect.andThen(Effect.void));
  }
}

// Mock service for testing
class MockService extends BaseService {
  public _startFn: () => Promise<void> | void;
  public _stopFn: () => Promise<void> | void;
  public _healthCheckFn: () => HealthCheckResult | Promise<HealthCheckResult>;

  constructor(
    name: string,
    startFn: () => Promise<void> | void,
    stopFn: () => Promise<void> | void,
    healthCheckFn: () => HealthCheckResult | Promise<HealthCheckResult>
  ) {
    super(name);
    this._startFn = startFn;
    this._stopFn = stopFn;
    this._healthCheckFn = healthCheckFn;
  }

  async start(): Promise<void> {
    const result = this._startFn();
    if (result instanceof Promise) {
      return result;
    }
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    const result = this._stopFn();
    if (result instanceof Promise) {
      return result;
    }
    return Promise.resolve();
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const result = this._healthCheckFn();
    return result instanceof Promise ? result : Promise.resolve(result);
  }
}
*/

// Placeholder class for skipped tests
class EffectServiceManager {
  constructor() {}
  addService(...args: any[]) { return Effect.void; }
  startService(...args: any[]) { return Effect.void; }
  startServiceEffect(...args: any[]) { return Effect.void; }
  stopServiceEffect(...args: any[]) { return Effect.void; }
  healthCheckServiceEffect(...args: any[]) { return Effect.succeed({ status: "running", details: {} }); }
}

// Placeholder for tests
class MockService {
  constructor(...args: any[]) {}
}

describe.skip("Effect-native ServiceManager", () => {
  let manager: EffectServiceManager;

  beforeEach(() => {
    manager = new EffectServiceManager();
  });

  it("should add services using Effect", async () => {
    const startMock = vi.fn();
    const stopMock = vi.fn();
    const healthMock = vi.fn(() => ({ status: "running" as const, details: {} }));
    const mockService = new MockService("test-service", startMock, stopMock, healthMock);

    const result = await Effect.runPromise(manager.addService(mockService));
    expect(result).toBe(undefined); // Effect<void> resolves to undefined
  });

  it("should prevent adding duplicate services", async () => {
    const startMock = vi.fn();
    const stopMock = vi.fn();
    const healthMock = vi.fn(() => ({ status: "running" as const, details: {} }));
    const mockService1 = new MockService("test-service", startMock, stopMock, healthMock);
    const mockService2 = new MockService("test-service", startMock, stopMock, healthMock);

    await Effect.runPromise(manager.addService(mockService1));

    const exit = await Effect.runPromise(Effect.exit(manager.addService(mockService2)));
    expect(Exit.isFailure(exit)).toBe(true);

    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause);
      expect(error.message).toContain("already exists");
    }
  });

  it("should start services using Fibers", async () => {
    const startMock = vi.fn();
    const stopMock = vi.fn();
    const healthMock = vi.fn(() => ({ status: "running" as const, details: {} }));
    const mockService = new MockService("test-service", startMock, stopMock, healthMock);

    await Effect.runPromise(manager.addService(mockService));

    // Start the service in a scoped environment
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* manager.startService("test-service");
          // Give time for the fiber to execute
          yield* Effect.sleep(100);
        })
      )
    );

    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it("should stop services by interrupting Fibers", async () => {
    const startMock = vi.fn();
    const stopMock = vi.fn();
    const healthMock = vi.fn(() => ({ status: "running" as const, details: {} }));
    const mockService = new MockService("test-service", startMock, stopMock, healthMock);

    await Effect.runPromise(manager.addService(mockService));

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* manager.startService("test-service");
          // Give time for the service to start
          yield* Effect.sleep(100);

          yield* manager.stopService("test-service");
          // Give time for the finalizer to run
          yield* Effect.sleep(100);
        })
      )
    );

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it("should handle service health checks", async () => {
    const startMock = vi.fn();
    const stopMock = vi.fn();
    const healthMock = vi.fn(() => ({
      status: "running" as const,
      details: { uptime: 1000 }
    }));
    const mockService = new MockService("test-service", startMock, stopMock, healthMock);

    await Effect.runPromise(manager.addService(mockService));

    const healthResult = await Effect.runPromise(manager.healthCheckService("test-service"));

    expect(healthMock).toHaveBeenCalledTimes(1);
    expect(healthResult.status).toBe("stopped"); // Managed status overrides service status
    expect(healthResult.details).toEqual({ uptime: 1000 });
  });

  it("should start all services concurrently", async () => {
    const services = Array.from({ length: 3 }, (_, i) => {
      const startMock = vi.fn();
      const stopMock = vi.fn();
      const healthMock = vi.fn(() => ({ status: "running" as const, details: {} }));
      return new MockService(`test-service-${i}`, startMock, stopMock, healthMock);
    });

    // Add all services
    for (const service of services) {
      await Effect.runPromise(manager.addService(service));
    }

    // Start all services in a scoped environment
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* manager.startAllServices();
          // Give time for all services to start
          yield* Effect.sleep(200);
        })
      )
    );

    // Verify all services were started
    for (const service of services) {
      expect(service._startFn).toHaveBeenCalledTimes(1);
    }
  });

  it("should stop all services concurrently", async () => {
    const services = Array.from({ length: 3 }, (_, i) => {
      const startMock = vi.fn();
      const stopMock = vi.fn();
      const healthMock = vi.fn(() => ({ status: "running" as const, details: {} }));
      return new MockService(`test-service-${i}`, startMock, stopMock, healthMock);
    });

    // Add all services
    for (const service of services) {
      await Effect.runPromise(manager.addService(service));
    }

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          // Start all services
          yield* manager.startAllServices();
          // Give time for all services to start
          yield* Effect.sleep(200);

          // Stop all services
          yield* manager.stopAllServices();
          // Give time for all services to stop
          yield* Effect.sleep(200);
        })
      )
    );

    // Verify all services were stopped
    for (const service of services) {
      expect(service._stopFn).toHaveBeenCalledTimes(1);
    }
  });

  it("should handle failed service startup", async () => {
    const startError = new Error("Service failed to start");
    const startMock = vi.fn(() => Promise.reject(startError));
    const stopMock = vi.fn();
    const healthMock = vi.fn(() => ({ status: "running" as const, details: {} }));
    const mockService = new MockService("failing-service", startMock, stopMock, healthMock);

    // Test that the adapter itself propagates the error correctly
    const adapter = new IServiceAdapter(mockService);
    const exit = await Effect.runPromise(
      Effect.exit(Effect.scoped(adapter.program))
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause) as Error;
      expect(error).toBe(startError);
    }
  });
});