import { describe, expect, it } from "vitest";
import { BaseService, ServiceManager } from "../index";
import type { HealthCheckResult } from "../src/interface";

// Silence the deprecation warnings during tests
// console.warn = () => {};

// Mock implementation of a service that can be configured to fail
class MockService extends BaseService {
  private failCount: number = 0;
  private shouldFail: boolean = false;
  private failTimes: number = 0;
  public startCalls: number = 0;
  private running: boolean = false;

  constructor(name: string) {
    super(name);
  }

  // Configure the service to fail a certain number of times before succeeding
  public setFailure(shouldFail: boolean, failTimes: number = Infinity): void {
    this.shouldFail = shouldFail;
    this.failTimes = failTimes;
    this.failCount = 0;
  }

  async start(): Promise<void> {
    this.startCalls++;

    // If configured to fail and we haven't exceeded failTimes
    if (this.shouldFail && this.failCount < this.failTimes) {
      this.failCount++;
      throw new Error(
        `Service ${this.name} failed to start (attempt ${this.failCount})`
      );
    }

    // Successfully started
    this.running = true;
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
  }

  async stop(): Promise<void> {
    this.running = false;
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async cleanup
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.running ? "running" : "stopped",
      details: {
        failCount: this.failCount,
        startCalls: this.startCalls,
        running: this.running,
      },
    };
  }
}


describe.skip("ServiceManager - Restart Policy", () => {
  it('should not restart service when policy is "no"', async () => {
    const manager = new ServiceManager();
    const service = new MockService("no-restart");
    service.setFailure(true, 1);

    manager.addService(service, {
      restartPolicy: "no",
    });

    // Start service, it will fail
    try {
      await manager.startService("no-restart");
    } catch (error) {
      // Expected to fail
    }

    const health = await manager.healthCheckService("no-restart");
    expect(health.status).toBe("crashed");
    expect(service.startCalls).toBe(1); // Should only be called once
  });

  it("service works correctly when configured to succeed", async () => {
    const manager = new ServiceManager();
    const service = new MockService("success-service");
    // Don't set failure - service will succeed

    manager.addService(service, {
      restartPolicy: "no",
    });

    // Start service, it should succeed
    await manager.startService("success-service");

    // Give time for service to start
    await new Promise(resolve => setTimeout(resolve, 100));

    const health = await manager.healthCheckService("success-service");
    expect(health.status).toBe("running");
    expect(service.startCalls).toBe(1);

    // Clean up
    await manager.stopService("success-service");
  });

  it("should handle service lifecycle correctly", async () => {
    const manager = new ServiceManager();
    const service = new MockService("lifecycle-test");

    manager.addService(service, {
      restartPolicy: "no",
    });

    // Start service
    await manager.startService("lifecycle-test");

    // Give time for service to start
    await new Promise(resolve => setTimeout(resolve, 100));

    const health1 = await manager.healthCheckService("lifecycle-test");
    expect(health1.status).toBe("running");

    // Stop service
    await manager.stopService("lifecycle-test");

    const health2 = await manager.healthCheckService("lifecycle-test");
    expect(health2.status).toBe("stopped");
  });
});
