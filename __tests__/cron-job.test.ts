import { describe, it, expect, beforeEach } from "vitest";
import { BaseService, ServiceManager } from "../index";

// Silence the deprecation warnings during tests
console.warn = () => {};

// Mock service for cron jobs
class CronTestService extends BaseService {
  public startCount = 0;
  public stopCount = 0;

  constructor(name: string) {
    super(name);
  }

  async start(): Promise<void> {
    this.startCount++;
  }

  async stop(): Promise<void> {
    this.stopCount++;
  }
}

describe("ServiceManager - Cron Jobs", () => {
  let manager: ServiceManager;
  let service: CronTestService;

  beforeEach(() => {
    manager = new ServiceManager();
    service = new CronTestService("cron-test");
  });

  it("should add service with cron configuration", () => {
    // Add service with cron config
    manager.addService(service, {
      cronJob: {
        schedule: "* * * * * *",
        timeout: 1000,
      },
    });

    // Verify the service was added
    expect(manager.services.length).toBe(1);
    expect(manager.services[0]?.name).toBe("cron-test");
  });

  it("should stop service when requested", async () => {
    // Add service with cron config
    manager.addService(service, {
      cronJob: {
        schedule: "* * * * * *",
        timeout: 1000,
      },
    });

    // Stop service
    await manager.stopService("cron-test");

    // Check service status
    const health = await manager.healthCheckService("cron-test");
    expect(health.status).toBe("stopped");
  });

  it("should remove service when requested", () => {
    // Add service with cron config
    manager.addService(service, {
      cronJob: {
        schedule: "* * * * * *",
        timeout: 1000,
      },
    });

    // Remove service
    manager.removeService("cron-test");

    // Verify service was removed
    expect(manager.services.length).toBe(0);
  });
});
