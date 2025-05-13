// Imports
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ServiceManager, BaseService, type HealthCheckResult } from "..";
import { createServiceManagerAPI } from "../api";

// Create a demo service by extending BaseService
class DemoService extends BaseService {
  private intervalId?: NodeJS.Timeout;

  constructor(name: string) {
    super(name);
  }

  async start(): Promise<void> {
    console.log(`${this.name} starting...`);

    // Simulate some initialization work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Service is now running
    console.log(`${this.name} is now running`);

    // Setup interval for simulated work
    this.intervalId = setInterval(() => {
      console.log(`${this.name} is doing work...`);
    }, 5000);
  }

  async stop(): Promise<void> {
    console.log(`${this.name} stopping...`);

    // Clear interval if exists
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Simulate cleanup work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`${this.name} stopped`);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running", // Placeholder; ServiceManager will override
      details: {
        uptime: Math.floor(Math.random() * 1000),
      },
    };
  }
}

// Create service manager and add services
const serviceManager = new ServiceManager();

// Regular service
const serviceA = new DemoService("service-a");
serviceManager.addService(serviceA, {
  restartPolicy: "always",
});

// Service with on-failure restart policy
const serviceB = new DemoService("service-b");
serviceManager.addService(serviceB, {
  restartPolicy: "on-failure",
  maxRetries: 3,
});

// Cron job service
const backupService = new DemoService("backup-service");
serviceManager.addService(backupService, {
  cronJob: {
    schedule: "*/15 * * * * *", // Every 15 seconds
    timeout: 10000, // 10 second timeout
  },
});

// Create the REST API
const app = createServiceManagerAPI(serviceManager, {
  openapi: {
    enabled: true,
    info: {
      title: "Demo Service Manager API",
      version: "1.0.0",
    },
  },
  scalar: {
    enabled: true,
    theme: "deepSpace",
  },
});

// Start the HTTP server
const port = 3000;
console.log(`Starting REST API server on port ${port}`);

// Use the Hono node server adapter
serve({
  fetch: app.fetch,
  port,
});

console.log(`
REST API is now available at http://localhost:${port}

Available endpoints:
- GET    /services              - List all services
- GET    /services/:name        - Get service details
- GET    /services/:name/health - Get service health
- POST   /services/:name/start  - Start a service
- POST   /services/:name/stop   - Stop a service
- POST   /services/:name/restart - Restart a service
- DELETE /services/:name        - Remove a service
- GET    /health                - Get health for all services
- POST   /services/start-all    - Start all services
- POST   /services/stop-all     - Stop all services
`);

// Start services A and B
serviceManager.startService("service-a");
