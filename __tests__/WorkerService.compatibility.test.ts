import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ServiceManager } from "../src/ServiceManager";
import { WorkerService } from "../src/WorkerService";
import { Effect } from "effect";

// Mock worker service for testing compatibility
class MockWorkerService extends WorkerService {
  private mockStarted = false;

  constructor(name: string) {
    super(name, {
      workerURL: "mock://worker.js", // Mock URL for testing
      autoTerminate: false
    });
  }

  async start(): Promise<void> {
    // Mock the worker start behavior without actually creating a worker
    this.mockStarted = true;
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async stop(): Promise<void> {
    // Mock the worker stop behavior
    this.mockStarted = false;
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async healthCheck() {
    return {
      status: this.mockStarted ? "running" as const : "stopped" as const,
      details: { isWorker: true, mockStarted: this.mockStarted }
    };
  }
}

describe("WorkerService Compatibility with Effect-based ServiceManager", () => {
  let serviceManager: ServiceManager;
  let workerService: MockWorkerService;

  beforeEach(() => {
    serviceManager = new ServiceManager();
    workerService = new MockWorkerService("test-worker");
  });

  afterEach(async () => {
    try {
      await serviceManager.stopAllServices();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should add WorkerService to the ServiceManager", async () => {
    serviceManager.addService(workerService, { restartPolicy: "no" });

    const services = serviceManager.services;
    expect(services).toHaveLength(1);
    expect(services[0]?.name).toBe("test-worker");
  });

  it("should start WorkerService using Effect-based methods", async () => {
    serviceManager.addService(workerService, { restartPolicy: "no" });

    await Effect.runPromise(
      serviceManager.startServiceEffect("test-worker")
    );

    // Give time for the service to start
    await new Promise(resolve => setTimeout(resolve, 100));

    const healthResult = await Effect.runPromise(
      serviceManager.healthCheckServiceEffect("test-worker")
    );

    // The ServiceManager overrides the status with its managed status
    expect(healthResult.status).toBe("running");
    // The details come from the service's health check, but note that
    // the service itself might not reflect being started yet due to async behavior
    expect(healthResult.details).toHaveProperty("isWorker", true);
  });

  it("should stop WorkerService using Effect-based methods", async () => {
    serviceManager.addService(workerService, { restartPolicy: "no" });

    // Start the service first
    await Effect.runPromise(
      serviceManager.startServiceEffect("test-worker")
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    // Stop the service
    await Effect.runPromise(
      serviceManager.stopServiceEffect("test-worker")
    );

    await new Promise(resolve => setTimeout(resolve, 100));

    const healthResult = await Effect.runPromise(
      serviceManager.healthCheckServiceEffect("test-worker")
    );

    expect(healthResult.status).toBe("stopped");
  });

  it("should handle WorkerService health checks properly", async () => {
    serviceManager.addService(workerService, { restartPolicy: "no" });

    const healthResult = await Effect.runPromise(
      serviceManager.healthCheckServiceEffect("test-worker")
    );

    expect(healthResult.status).toBe("stopped");
    expect(healthResult.details).toEqual({ isWorker: true, mockStarted: false });
  });

  it("should integrate WorkerService with start/stop all operations", async () => {
    const worker1 = new MockWorkerService("worker-1");
    const worker2 = new MockWorkerService("worker-2");

    serviceManager.addService(worker1, { restartPolicy: "no" });
    serviceManager.addService(worker2, { restartPolicy: "no" });

    // Start all services
    await Effect.runPromise(
      serviceManager.startAllServicesEffect()
    );

    await new Promise(resolve => setTimeout(resolve, 200));

    // Check all services are running (managed status)
    const healthAll = await Effect.runPromise(
      serviceManager.healthCheckAllServicesEffect()
    );

    expect(healthAll["worker-1"]?.status).toBe("running");
    expect(healthAll["worker-2"]?.status).toBe("running");
    expect(healthAll["worker-1"]?.details).toHaveProperty("isWorker", true);
    expect(healthAll["worker-2"]?.details).toHaveProperty("isWorker", true);

    // Stop all services
    await Effect.runPromise(
      serviceManager.stopAllServicesEffect()
    );

    await new Promise(resolve => setTimeout(resolve, 200));

    // Check all services are stopped
    const healthAllAfterStop = await Effect.runPromise(
      serviceManager.healthCheckAllServicesEffect()
    );

    expect(healthAllAfterStop["worker-1"]?.status).toBe("stopped");
    expect(healthAllAfterStop["worker-2"]?.status).toBe("stopped");
  });
});