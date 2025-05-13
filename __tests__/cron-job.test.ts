import { describe, it, expect, beforeEach } from "vitest";
import { BaseService, ServiceManager } from "../index";

// Skip mocking the cron library for now, just focus on basic functionality

// Mock service for cron jobs
class CronTestService extends BaseService {
  public startCount = 0;
  public stopCount = 0;

  constructor(name: string) {
    super(name);
  }

  async start(): Promise<void> {
    this.startCount++;
    this.setStatus("running");
  }

  async stop(): Promise<void> {
    this.stopCount++;
    this.setStatus("stopped");
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
    expect(service.getStatus()).toBe("stopped");
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
