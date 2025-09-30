import { describe, it, expect, beforeEach } from "vitest";
import { BaseService, ServiceManager } from "../index";
import { Schedule, Duration } from "effect";

// Mock service for scheduled jobs
class ScheduledTestService extends BaseService {
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

describe("ServiceManager - Scheduled Jobs", () => {
  let manager: ServiceManager;
  let service: ScheduledTestService;

  beforeEach(() => {
    manager = new ServiceManager();
    service = new ScheduledTestService("scheduled-test");
  });

  it("should add service with scheduled job configuration", () => {
    // Add service with scheduled job config
    manager.addService(service, {
      scheduledJob: {
        schedule: Schedule.spaced(Duration.seconds(1)),
        timeout: Duration.seconds(1),
      },
    });

    // Verify the service was added
    expect(manager.services.length).toBe(1);
    expect(manager.services[0]?.name).toBe("scheduled-test");
  });

  it("should stop service when requested", async () => {
    // Add service with scheduled job config
    manager.addService(service, {
      scheduledJob: {
        schedule: Schedule.spaced(Duration.seconds(1)),
        timeout: Duration.seconds(1),
      },
    });

    // Stop service
    await manager.stopService("scheduled-test");

    // Check service status
    const health = await manager.healthCheckService("scheduled-test");
    expect(health.status).toBe("stopped");
  });

  it("should remove service when requested", () => {
    // Add service with scheduled job config
    manager.addService(service, {
      scheduledJob: {
        schedule: Schedule.spaced(Duration.seconds(1)),
        timeout: Duration.seconds(1),
      },
    });

    // Remove service
    manager.removeService("scheduled-test");

    // Verify service was removed
    expect(manager.services.length).toBe(0);
  });
});
