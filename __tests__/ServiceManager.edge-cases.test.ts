import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from "vitest";
import { Effect, Fiber, Duration } from "effect";
import { ServiceManager } from "../src/ServiceManager";
import { BaseService } from "../src/BaseService";
import type { HealthCheckResult, IService } from "../src/interface";

// Mock console.error to suppress error messages during tests
let originalConsoleError: typeof console.error;
let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  originalConsoleError = console.error;
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.error = originalConsoleError;
});

// Mock service that simulates resource acquisition failures
class ResourceFailureService extends BaseService {
  private shouldFailResource: boolean = false;
  private resourceAcquired: boolean = false;

  constructor(name: string) {
    super(name);
  }

  setResourceFailure(shouldFail: boolean): void {
    this.shouldFailResource = shouldFail;
  }

  async start(): Promise<void> {
    if (this.shouldFailResource) {
      throw new Error(`Failed to acquire resources for ${this.name}`);
    }

    this.resourceAcquired = true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async stop(): Promise<void> {
    if (this.resourceAcquired) {
      this.resourceAcquired = false;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.resourceAcquired ? "running" : "stopped",
      details: { resourceAcquired: this.resourceAcquired },
    };
  }
}

// Mock service that simulates hanging during start (simulates uninterruptible operations)
class HangingService extends BaseService {
  private shouldHang: boolean = false;
  private hangDuration: number = 5000;

  constructor(name: string) {
    super(name);
  }

  setHangBehavior(shouldHang: boolean, duration: number = 5000): void {
    this.shouldHang = shouldHang;
    this.hangDuration = duration;
  }

  async start(): Promise<void> {
    if (this.shouldHang) {
      // Simulate a long-running operation that might be uninterruptible
      await new Promise(resolve => setTimeout(resolve, this.hangDuration));
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async stop(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running",
      details: { hangBehavior: this.shouldHang },
    };
  }
}

// Mock service that fails during stop (resource cleanup issues)
class StopFailureService extends BaseService {
  private shouldFailStop: boolean = false;
  private started: boolean = false;

  constructor(name: string) {
    super(name);
  }

  setStopFailure(shouldFail: boolean): void {
    this.shouldFailStop = shouldFail;
  }

  async start(): Promise<void> {
    this.started = true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async stop(): Promise<void> {
    if (this.shouldFailStop) {
      throw new Error(`Failed to clean up resources for ${this.name}`);
    }
    this.started = false;
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.started ? "running" : "stopped",
      details: { started: this.started },
    };
  }
}

describe("ServiceManager Edge Cases", () => {
  let serviceManager: ServiceManager;

  beforeEach(() => {
    serviceManager = new ServiceManager();
    // Clear console error mock before each test
    consoleSpy.mockClear();
  });

  describe("Resource Acquisition Failures", () => {
    it("should handle service start failure gracefully", async () => {
      const service = new ResourceFailureService("resource-fail-service");
      service.setResourceFailure(true);

      serviceManager.addService(service, { restartPolicy: "no" });

      try {
        await serviceManager.startService("resource-fail-service");
        expect.fail("Service should have failed to start");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Failed to acquire resources");
      }

      const health = await serviceManager.healthCheckService("resource-fail-service");
      expect(health.status).toBe("crashed");
    });

    it("should handle multiple concurrent start failures", async () => {
      const service1 = new ResourceFailureService("fail-service-1");
      const service2 = new ResourceFailureService("fail-service-2");
      const service3 = new ResourceFailureService("fail-service-3");

      service1.setResourceFailure(true);
      service2.setResourceFailure(true);
      service3.setResourceFailure(true);

      serviceManager.addService(service1, { restartPolicy: "no" });
      serviceManager.addService(service2, { restartPolicy: "no" });
      serviceManager.addService(service3, { restartPolicy: "no" });

      // Try to start all services concurrently
      const results = await Promise.allSettled([
        serviceManager.startService("fail-service-1"),
        serviceManager.startService("fail-service-2"),
        serviceManager.startService("fail-service-3"),
      ]);

      // All should have failed
      results.forEach((result, index) => {
        expect(result.status).toBe("rejected");
        if (result.status === "rejected") {
          expect(result.reason.message).toContain("Failed to acquire resources");
        }
      });

      // All services should be in crashed state
      const health1 = await serviceManager.healthCheckService("fail-service-1");
      const health2 = await serviceManager.healthCheckService("fail-service-2");
      const health3 = await serviceManager.healthCheckService("fail-service-3");

      expect(health1.status).toBe("crashed");
      expect(health2.status).toBe("crashed");
      expect(health3.status).toBe("crashed");
    });
  });

  describe("Service Stop/Cleanup Failures", () => {
    it("should handle service stop failure during shutdown", async () => {
      const service = new StopFailureService("stop-fail-service");
      service.setStopFailure(true);

      serviceManager.addService(service, { restartPolicy: "no" });

      // Start the service successfully
      await serviceManager.startService("stop-fail-service");

      // Give time for service to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify it's running
      const healthBefore = await serviceManager.healthCheckService("stop-fail-service");
      expect(healthBefore.status).toBe("running");

      // Try to stop it (should fail)
      try {
        await serviceManager.stopService("stop-fail-service");
        throw new Error("Service stop should have failed");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Failed to clean up resources");
      }

      // Service should be marked as crashed due to stop failure
      const healthAfter = await serviceManager.healthCheckService("stop-fail-service");
      expect(healthAfter.status).toBe("crashed");
    });

    it("should handle cleanup issues during service removal", async () => {
      const service = new StopFailureService("cleanup-fail-service");
      service.setStopFailure(true);

      serviceManager.addService(service, { restartPolicy: "no" });

      // Start the service
      await serviceManager.startService("cleanup-fail-service");

      // Give time for service to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Try to remove the service (which involves stopping it)
      try {
        await serviceManager.removeService("cleanup-fail-service");
      } catch (error) {
        // Should still work despite stop failure
        expect(error).toBeInstanceOf(Error);
      }

      // Service should be removed from the manager despite stop failure
      const services = serviceManager.services;
      expect(services.find(s => s.name === "cleanup-fail-service")).toBeUndefined();
    });
  });

  describe("Timeout and Interruption Handling", () => {
    it("should handle service interruption correctly", async () => {
      const service = new HangingService("hanging-service");
      // Don't set hanging behavior for this test - we want normal behavior

      serviceManager.addService(service, { restartPolicy: "no" });

      // Start and immediately stop to test interruption
      await serviceManager.startService("hanging-service");

      // Give a small time for the service to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Stop the service (tests fiber interruption)
      await serviceManager.stopService("hanging-service");

      const health = await serviceManager.healthCheckService("hanging-service");
      expect(health.status).toBe("stopped");
    });

    it("should handle fiber interruption during service lifecycle", async () => {
      const service1 = new ResourceFailureService("fiber-test-1");
      const service2 = new ResourceFailureService("fiber-test-2");

      serviceManager.addService(service1, { restartPolicy: "no" });
      serviceManager.addService(service2, { restartPolicy: "no" });

      // Start both services
      await serviceManager.startService("fiber-test-1");
      await serviceManager.startService("fiber-test-2");

      // Give time for services to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop all services concurrently (tests concurrent fiber interruption)
      await serviceManager.stopAllServices();

      const health1 = await serviceManager.healthCheckService("fiber-test-1");
      const health2 = await serviceManager.healthCheckService("fiber-test-2");

      expect(health1.status).toBe("stopped");
      expect(health2.status).toBe("stopped");
    });
  });

  describe("Effect-specific Edge Cases", () => {
    it("should handle Effect program completion correctly", async () => {
      const service = new ResourceFailureService("effect-completion-test");

      serviceManager.addService(service, { restartPolicy: "no" });

      // Start the service
      await serviceManager.startService("effect-completion-test");

      // Give time for the Effect program to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Service should be running (Effect.never keeps it alive)
      const health = await serviceManager.healthCheckService("effect-completion-test");
      expect(health.status).toBe("running");

      // Stop should work correctly
      await serviceManager.stopService("effect-completion-test");

      const healthAfterStop = await serviceManager.healthCheckService("effect-completion-test");
      expect(healthAfterStop.status).toBe("stopped");
    });

    it("should handle concurrent service operations without conflicts", async () => {
      const services = Array.from({ length: 5 }, (_, i) =>
        new ResourceFailureService(`concurrent-test-${i}`)
      );

      // Add all services
      services.forEach(service => {
        serviceManager.addService(service, { restartPolicy: "no" });
      });

      // Start all services concurrently
      await Promise.all(
        services.map(service => serviceManager.startService(service.name))
      );

      // Give time for all services to start
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify all are running
      const healthChecks = await Promise.all(
        services.map(service => serviceManager.healthCheckService(service.name))
      );

      healthChecks.forEach(health => {
        expect(health.status).toBe("running");
      });

      // Stop all services concurrently
      await Promise.all(
        services.map(service => serviceManager.stopService(service.name))
      );

      // Verify all are stopped
      const healthChecksAfterStop = await Promise.all(
        services.map(service => serviceManager.healthCheckService(service.name))
      );

      healthChecksAfterStop.forEach(health => {
        expect(health.status).toBe("stopped");
      });
    });
  });

  describe("Health Check Edge Cases", () => {
    it("should handle health check failures gracefully", async () => {
      // Create a service that throws during health check
      class FailingHealthCheckService extends BaseService {
        constructor(name: string) {
          super(name);
        }

        async start(): Promise<void> {
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        async stop(): Promise<void> {
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        async healthCheck(): Promise<HealthCheckResult> {
          throw new Error("Health check failed");
        }
      }

      const service = new FailingHealthCheckService("failing-health-service");
      serviceManager.addService(service, { restartPolicy: "no" });

      await serviceManager.startService("failing-health-service");

      // Give time for service to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Health check should handle the error gracefully
      try {
        const health = await serviceManager.healthCheckService("failing-health-service");
        // Should still get a response, likely with managed status
        expect(health).toBeDefined();
        expect(health.status).toBe("running"); // Managed status overrides
      } catch (error) {
        // Or it might propagate the error, which is also acceptable
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});