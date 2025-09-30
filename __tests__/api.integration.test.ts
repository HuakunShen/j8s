import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { createServiceManagerAPI } from "../src/api";
import { ServiceManager } from "../src/ServiceManager";
import { BaseService } from "../src/BaseService";
import type { HealthCheckResult } from "../src/interface";

class TestService extends BaseService {
  private running = false;
  private shouldFail = false;

  constructor(name: string, shouldFail = false) {
    super(name);
    this.shouldFail = shouldFail;
  }

  async start(): Promise<void> {
    if (this.shouldFail) {
      throw new Error(`Service ${this.name} failed to start`);
    }
    this.running = true;
    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async stop(): Promise<void> {
    this.running = false;
    // Simulate some async cleanup work
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.running ? "running" : "stopped",
      details: { running: this.running },
    };
  }
}

// Helper function to make requests with proper typing fallback
async function makeApiRequest(appInstance: Hono, endpoint: string, method: string = 'GET') {
  const req = new Request(`http://localhost${endpoint}`, { method });
  return await appInstance.request(req);
}

describe("API Integration Tests", () => {
  let app: Hono;
  let serviceManager: ServiceManager;
  let testService: TestService;
  let failingService: TestService;

  beforeEach(async () => {
    serviceManager = new ServiceManager();
    app = createServiceManagerAPI(serviceManager);

    testService = new TestService("test-service");
    failingService = new TestService("failing-service", true);

    // Add services with "no" restart policy to prevent auto-restart during tests
    serviceManager.addService(testService, { restartPolicy: "no" });
    serviceManager.addService(failingService, { restartPolicy: "no" });
  });

  afterEach(async () => {
    try {
      await serviceManager.stopAllServices();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("GET /api/services", () => {
    it("should list all registered services", async () => {
      const res = await makeApiRequest(app, "/api/services");

      expect(res.status).toBe(200);
      const body = await res.json() as { services: { name: string }[] };
      expect(body.services).toHaveLength(2);
      expect(body.services).toEqual([
        { name: "test-service" },
        { name: "failing-service" },
      ]);
    });
  });

  describe("GET /api/services/:name", () => {
    it("should get service details", async () => {
      const res = await makeApiRequest(app, "/api/services/test-service");

      expect(res.status).toBe(200);
      const body = await res.json() as { name: string; status: string; health: HealthCheckResult };
      expect(body.name).toBe("test-service");
      expect(body.status).toBe("stopped");
      expect(body.health).toEqual({
        status: "stopped",
        details: { running: false },
      });
    });

    it("should return 404 for non-existent service", async () => {
      const res = await makeApiRequest(app, "/api/services/non-existent");

      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("not found");
    });
  });

  describe("POST /api/services/:name/start", () => {
    it("should start a service successfully", async () => {
      const res = await makeApiRequest(app, "/api/services/test-service/start", "POST");

      expect(res.status).toBe(200);
      const body = await res.json() as { message: string };
      expect(body.message).toContain("started");

      // Give time for the service to start
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it("should handle service startup failure immediately", async () => {
      const res = await makeApiRequest(app, "/api/services/failing-service/start", "POST");

      // With the hybrid approach, service failures are detected immediately
      // so the API correctly returns a 500 error
      expect(res.status).toBe(500);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("failed");

      // Verify the service is in crashed state
      const healthRes = await makeApiRequest(app, "/api/services/failing-service/health");
      const healthBody = await healthRes.json() as HealthCheckResult;

      // The service should eventually be in crashed state
      // or the details should show the service failed to start properly
      expect(healthBody.details?.running).toBe(false);
    });
  });

  describe("POST /api/services/:name/stop", () => {
    it("should stop a running service", async () => {
      // Start service via API
      const startRes = await makeApiRequest(app, "/api/services/test-service/start", "POST");
      expect(startRes.status).toBe(200);

      // Give time for the service to start
      await new Promise(resolve => setTimeout(resolve, 300));

      const res = await makeApiRequest(app, "/api/services/test-service/stop", "POST");

      expect(res.status).toBe(200);
      const body = await res.json() as { message: string };
      expect(body.message).toContain("stopped");
    }, 10000); // 10 second timeout
  });

  describe("POST /api/services/:name/restart", () => {
    it("should restart a service", async () => {
      // Start service via API first
      const startRes = await makeApiRequest(app, "/api/services/test-service/start", "POST");
      expect(startRes.status).toBe(200);

      // Give time for the service to start
      await new Promise(resolve => setTimeout(resolve, 300));

      const res = await makeApiRequest(app, "/api/services/test-service/restart", "POST");

      expect(res.status).toBe(200);
      const body = await res.json() as { message: string };
      expect(body.message).toContain("restarted");
    }, 10000); // 10 second timeout
  });

  describe("DELETE /api/services/:name", () => {
    it("should remove a service", async () => {
      const res = await makeApiRequest(app, "/api/services/test-service", "DELETE");

      expect(res.status).toBe(200);
      const body = await res.json() as { message: string };
      expect(body.message).toContain("removed");

      // Verify service is removed
      const listRes = await makeApiRequest(app, "/api/services");
      const listBody = await listRes.json() as { services: { name: string }[] };
      expect(listBody.services).toHaveLength(1);
      expect(listBody.services[0]?.name).toBe("failing-service");
    });
  });

  describe("GET /api/services/:name/health", () => {
    it("should get health status for a service", async () => {
      const res = await makeApiRequest(app, "/api/services/test-service/health");

      expect(res.status).toBe(200);
      const body = await res.json() as HealthCheckResult;
      expect(body.status).toBe("stopped");
      expect(body.details).toEqual({ running: false });
    });
  });

  describe("GET /api/health", () => {
    it("should get health status for all services", async () => {
      const res = await makeApiRequest(app, "/api/health");

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, HealthCheckResult>;
      expect(body).toHaveProperty("test-service");
      expect(body).toHaveProperty("failing-service");
      expect(body["test-service"]?.status).toBe("stopped");
      expect(body["failing-service"]?.status).toBe("stopped");
    });
  });

  describe("POST /api/services/start-all", () => {
    it("should fail when starting all services if any fail", async () => {
      const res = await makeApiRequest(app, "/api/services/start-all", "POST");

      // With the hybrid approach, if any service fails to start,
      // the start-all operation should return an error
      expect(res.status).toBe(500);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("failed");
    });

    it("should start all services when all succeed", async () => {
      // Create a new service manager with only working services
      const workingServiceManager = new ServiceManager();
      const workingService1 = new TestService("working-1");
      const workingService2 = new TestService("working-2");

      workingServiceManager.addService(workingService1, { restartPolicy: "no" });
      workingServiceManager.addService(workingService2, { restartPolicy: "no" });

      const workingApp = createServiceManagerAPI(workingServiceManager);

      const res = await makeApiRequest(workingApp, "/api/services/start-all", "POST");

      expect(res.status).toBe(200);
      const body = await res.json() as { message: string };
      expect(body.message).toBe("All services started");

      // Cleanup
      await workingServiceManager.stopAllServices();
    });
  });

  describe("POST /api/services/stop-all", () => {
    it("should stop all services", async () => {
      const res = await makeApiRequest(app, "/api/services/stop-all", "POST");

      expect(res.status).toBe(200);
      const body = await res.json() as { message: string };
      expect(body.message).toBe("All services stopped");
    });
  });

  describe("OpenAPI Documentation", () => {
    it("should serve OpenAPI spec when enabled", async () => {
      const apiWithOpenAPI = createServiceManagerAPI(serviceManager, {
        openapi: {
          enabled: true,
          info: {
            title: "Test API",
            version: "1.0.0",
          },
        },
      });

      const res = await makeApiRequest(apiWithOpenAPI, "/openapi");

      expect(res.status).toBe(200);
      const body = await res.json() as { info: { title: string } };
      expect(body.info.title).toBe("Test API");
    });
  });

  describe("Scalar API Reference", () => {
    it("should serve Scalar UI when enabled", async () => {
      const apiWithScalar = createServiceManagerAPI(serviceManager, {
        openapi: { enabled: true },
        scalar: {
          enabled: true,
          theme: "deepSpace",
        },
      });

      const res = await makeApiRequest(apiWithScalar, "/scalar");

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("text/html");
    });
  });
});