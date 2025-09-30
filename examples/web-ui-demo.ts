#!/usr/bin/env node

/**
 * Web UI Demo for j8s
 *
 * This example demonstrates how to set up and use the built-in web UI
 * for monitoring and managing j8s services.
 *
 * Features demonstrated:
 * - Setting up the web UI
 * - Service monitoring dashboard
 * - Real-time health checks
 * - Service management controls
 * - Metrics and performance tracking
 */

import {
  ServiceManager,
  BaseService,
  createServiceManagerUI,
  createServiceManagerAPI,
} from "j8s";

import { serve } from "@hono/node-server";
import { Effect, Console } from "effect";

// Example services for the demo
class APIService extends BaseService {
  constructor() {
    super("api-service");
  }

  async start(): Promise<void> {
    console.log("🚀 Starting API Service");
    // Simulate API service startup
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("✅ API Service started");
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping API Service");
    // Simulate API service shutdown
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log("✅ API Service stopped");
  }

  async healthCheck(): Promise<import("j8s").HealthCheckResult> {
    // Simulate health check with some randomness
    const isHealthy = Math.random() > 0.1; // 90% healthy

    return {
      status: isHealthy ? "running" : "unhealthy",
      details: {
        version: "1.0.0",
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requests: Math.floor(Math.random() * 1000),
        lastHealthCheck: Date.now(),
      },
    };
  }
}

class DatabaseService extends BaseService {
  private isConnected = false;

  constructor() {
    super("database-service");
  }

  async start(): Promise<void> {
    console.log("🗄️ Starting Database Service");
    // Simulate database connection
    await new Promise((resolve) => setTimeout(resolve, 2000));
    this.isConnected = true;
    console.log("✅ Database Service connected");
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping Database Service");
    // Simulate database disconnect
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.isConnected = false;
    console.log("✅ Database Service disconnected");
  }

  async healthCheck(): Promise<import("j8s").HealthCheckResult> {
    return {
      status: this.isConnected ? "running" : "stopped",
      details: {
        connected: this.isConnected,
        connectionCount: Math.floor(Math.random() * 10) + 1,
        queryCount: Math.floor(Math.random() * 5000),
        lastBackup: new Date(
          Date.now() - Math.random() * 86400000
        ).toISOString(),
      },
    };
  }
}

class CacheService extends BaseService {
  private cacheSize = 0;

  constructor() {
    super("cache-service");
  }

  async start(): Promise<void> {
    console.log("⚡ Starting Cache Service");
    // Simulate cache startup
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.cacheSize = Math.floor(Math.random() * 1000) + 100;
    console.log(`✅ Cache Service started with ${this.cacheSize} items`);
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping Cache Service");
    // Simulate cache shutdown
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.cacheSize = 0;
    console.log("✅ Cache Service stopped");
  }

  async healthCheck(): Promise<import("j8s").HealthCheckResult> {
    // Simulate cache performance metrics
    const hitRate = Math.random() * 0.1 + 0.8; // 80-90% hit rate

    return {
      status: "running",
      details: {
        cacheSize: this.cacheSize,
        hitRate: Math.round(hitRate * 100),
        memoryUsage: Math.round(this.cacheSize * 0.001), // KB
        evictionCount: Math.floor(Math.random() * 100),
      },
    };
  }
}

class WorkerService extends BaseService {
  private isActive = false;
  private processedJobs = 0;

  constructor() {
    super("worker-service");
  }

  async start(): Promise<void> {
    console.log("👷 Starting Worker Service");
    // Simulate worker startup
    await new Promise((resolve) => setTimeout(resolve, 1500));
    this.isActive = true;

    // Simulate background job processing
    this.simulateJobProcessing();
    console.log("✅ Worker Service started");
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping Worker Service");
    this.isActive = false;
    // Simulate worker shutdown
    await new Promise((resolve) => setTimeout(resolve, 800));
    console.log("✅ Worker Service stopped");
  }

  async healthCheck(): Promise<import("j8s").HealthCheckResult> {
    return {
      status: this.isActive ? "running" : "stopped",
      details: {
        active: this.isActive,
        processedJobs: this.processedJobs,
        queueSize: Math.floor(Math.random() * 50),
        workerCount: Math.floor(Math.random() * 5) + 1,
        lastJobTime: new Date(Date.now() - Math.random() * 60000).toISOString(),
      },
    };
  }

  private simulateJobProcessing(): void {
    if (!this.isActive) return;

    // Simulate job processing
    setTimeout(
      () => {
        this.processedJobs += Math.floor(Math.random() * 5) + 1;
        this.simulateJobProcessing();
      },
      Math.random() * 3000 + 1000
    );
  }
}

// Main application setup
const setupWebUIDemo = Effect.gen(function* () {
  yield* Console.log("🌐 Setting up j8s Web UI Demo");

  // Create service manager
  const manager = new ServiceManager();

  // Create demo services
  const services = [
    new APIService(),
    new DatabaseService(),
    new CacheService(),
    new WorkerService(),
  ];

  // Add all services
  for (const service of services) {
    manager.addService(service);
  }

  // Start all services using Effect
  yield* Console.log("🚀 Starting all services...");
  try {
    yield* Effect.tryPromise({
      try: () => manager.startAllServices(),
      catch: () => new Error("Failed to start services"),
    });
    yield* Console.log("✅ All services started successfully");
  } catch (error) {
    yield* Console.error("❌ Some services failed to start");
  }

  // Create the web UI
  const app = createServiceManagerUI(manager);

  // Also create the REST API for programmatic access
  const apiApp = createServiceManagerAPI(manager, {
    openapi: {
      enabled: true,
      info: {
        title: "j8s Service Manager API",
        version: "1.0.0",
        description: "API for managing j8s services with web UI demo",
      },
      servers: [{ url: "http://localhost:3001", description: "API Server" }],
    },
    scalar: {
      enabled: true,
      theme: "deepSpace",
    },
  });

  // Start both servers
  yield* Console.log("\n🌐 Starting web servers...");

  // Start Web UI server
  yield* Effect.async<unknown, Error>((resume) => {
    const server = serve({
      fetch: app.fetch,
      port: 3000,
    });

    console.log("🎯 Web UI Dashboard: http://localhost:3000");
    console.log("📊 Features available:");
    console.log("   - Real-time service monitoring");
    console.log("   - Service health status");
    console.log("   - Start/Stop/Restart controls");
    console.log("   - Performance metrics");
    console.log("   - Error logs and debugging");

    server.on("error", (error) => {
      resume(Effect.fail(error));
    });

    // Keep the server running
    setTimeout(() => {
      resume(Effect.succeed(undefined));
    }, 100);
  });

  // Start API server
  yield* Effect.async<unknown, Error>((resume) => {
    const server = serve({
      fetch: apiApp.fetch,
      port: 3001,
    });

    console.log("\n🔌 API Server: http://localhost:3001");
    console.log("📖 API Documentation: http://localhost:3001/scalar");
    console.log("📋 OpenAPI Spec: http://localhost:3001/openapi");
    console.log("🔧 Available endpoints:");
    console.log("   GET  /services - List all services");
    console.log("   GET  /services/:name - Get service details");
    console.log("   GET  /services/:name/health - Get service health");
    console.log("   POST /services/:name/start - Start a service");
    console.log("   POST /services/:name/stop - Stop a service");
    console.log("   POST /services/:name/restart - Restart a service");
    console.log("   GET  /health - Get system health");

    server.on("error", (error) => {
      resume(Effect.fail(error));
    });

    // Keep the server running
    setTimeout(() => {
      resume(Effect.succeed(undefined));
    }, 100);
  });

  yield* Console.log("\n✅ Web UI Demo is running!");
  yield* Console.log("💡 Try these interactions:");
  yield* Console.log("   1. Open the dashboard in your browser");
  yield* Console.log("   2. Watch services update in real-time");
  yield* Console.log("   3. Try starting/stopping services from the UI");
  yield* Console.log("   4. Check the API documentation");
  yield* Console.log("   5. Monitor service metrics and health");
  yield* Console.log("\n⚠️  Press Ctrl+C to stop the demo");

  // Keep the application running
  yield* Effect.forever(Effect.sleep(1000));
});

// Run the demo
const mainProgram = Effect.gen(function* () {
  // Setup signal handlers for graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n🛑 Received SIGINT, shutting down gracefully...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
    process.exit(0);
  });

  return yield* setupWebUIDemo;
});

console.log("🚀 Starting j8s Web UI Demo...\n");
console.log("This demo will show:");
console.log("• Real-time service monitoring dashboard");
console.log("• Service management controls");
console.log("• Performance metrics and health checks");
console.log("• REST API with interactive documentation\n");

Effect.runPromise(mainProgram).catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
