/**
 * Effect API Server Example
 * 
 * This example demonstrates how to create and run an Effect-based API server
 * with comprehensive service management, observability, and real-time monitoring.
 */

import { Effect, Console, Layer } from "effect";
import { serve } from "@hono/node-server";
import { LoggingService, DatabaseService } from "./basic-service";
import { BackupService, CleanupService } from "./cron-service";
import { EffectServiceManagerLive, ServiceContextLive } from "../../src/effect/EffectServiceManager";
import { createEffectServiceManagerAPI } from "../../src/effect/EffectAPI";
import { makeObservabilityLayer, defaultObservabilityConfig } from "../../src/effect/Observability";
import { CommonRetryPolicies } from "../../src/effect/RetryPolicies";
import type { EffectAPIConfig } from "../../src/effect/EffectAPI";

/**
 * API configuration
 */
const apiConfig: EffectAPIConfig = {
  openapi: {
    enabled: true,
    info: {
      title: "j8s Effect Service Manager API",
      version: "2.0.0",
      description: "Advanced service management API with Effect integration"
    },
    servers: [
      { url: "http://localhost:3000", description: "Development Server" }
    ]
  },
  scalar: {
    enabled: true,
    theme: "deepSpace"
  },
  streaming: {
    enabled: true,
    bufferSize: 1000,
    keepAliveInterval: 30000
  },
  cors: {
    enabled: true,
    origins: ["http://localhost:3000", "http://localhost:8080"]
  },
  rateLimit: {
    enabled: true,
    requestsPerMinute: 100
  }
};

/**
 * Create and configure application services
 */
const createApplicationServices = () => Effect.gen(function* () {
  const serviceManager = yield* EffectServiceManager;
  
  // Create various types of services to demonstrate API capabilities
  const services = [
    new LoggingService("api-logger", {
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { component: "api", environment: "demo" }
      }
    }),
    
    new DatabaseService("user-db", {
      retryPolicy: CommonRetryPolicies.database,
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { component: "database", type: "users" }
      }
    }),
    
    new DatabaseService("analytics-db", {
      retryPolicy: CommonRetryPolicies.database,
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { component: "database", type: "analytics" }
      }
    }),
    
    new BackupService("nightly-backup"),
    new CleanupService("hourly-cleanup")
  ];
  
  // Add all services to the manager
  for (const service of services) {
    yield* serviceManager.addService(service);
  }
  
  yield* Console.log(`Added ${services.length} services to the manager`);
  
  return services;
});

/**
 * Start the API server
 */
const startAPIServer = (port: number = 3000) => Effect.gen(function* () {
  const serviceManager = yield* EffectServiceManager;
  const observabilityManager = yield* ObservabilityManager;
  
  // Create the Effect-based API
  const app = yield* createEffectServiceManagerAPI(
    serviceManager,
    observabilityManager,
    apiConfig
  );
  
  // Add custom middleware for logging requests
  app.use("*", async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    
    console.log(`${method} ${path} - Started`);
    
    await next();
    
    const duration = Date.now() - start;
    const status = c.res.status;
    
    console.log(`${method} ${path} - ${status} (${duration}ms)`);
  });
  
  // Add health check endpoint for the API itself
  app.get("/health", (c) => {
    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "2.0.0"
    });
  });
  
  // Add metrics endpoint
  app.get("/metrics", async (c) => {
    try {
      const metrics = await Effect.runPromise(
        observabilityManager.getMetricsSnapshot()
      );
      
      return c.json({
        metrics: {
          counters: Object.fromEntries(metrics.counters),
          gauges: Object.fromEntries(metrics.gauges),
          histograms: Object.fromEntries(
            Array.from(metrics.histograms.entries()).map(([key, values]) => [
              key,
              {
                count: values.length,
                min: Math.min(...values),
                max: Math.max(...values),
                avg: values.reduce((a, b) => a + b, 0) / values.length
              }
            ])
          )
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return c.json({ error: String(error) }, 500);
    }
  });
  
  // Start the HTTP server
  const server = serve({
    fetch: app.fetch,
    port
  });
  
  yield* Console.log(`API server started on http://localhost:${port}`);
  yield* Console.log(`OpenAPI documentation: http://localhost:${port}/openapi`);
  yield* Console.log(`API reference: http://localhost:${port}/scalar`);
  yield* Console.log(`Health check: http://localhost:${port}/health`);
  yield* Console.log(`Metrics: http://localhost:${port}/metrics`);
  yield* Console.log(`Service UI: http://localhost:${port}/`);
  
  return server;
});

/**
 * Demonstrate API functionality
 */
const demonstrateAPI = (port: number = 3000) => Effect.gen(function* () {
  const baseUrl = `http://localhost:${port}`;
  
  yield* Console.log("=== API Demonstration ===");
  
  // Wait a bit for server to be ready
  yield* Effect.sleep(2000);
  
  try {
    // Demonstrate various API calls
    yield* Console.log("Testing API endpoints...");
    
    // List services
    const listResponse = yield* Effect.promise(() => 
      fetch(`${baseUrl}/api/v2/services`).then(r => r.json())
    );
    yield* Console.log(`Services: ${JSON.stringify(listResponse, null, 2)}`);
    
    // Start all services
    yield* Console.log("Starting all services via API...");
    yield* Effect.promise(() => 
      fetch(`${baseUrl}/api/v2/services/start-all`, { method: 'POST' })
    );
    
    // Wait for services to start
    yield* Effect.sleep(3000);
    
    // Check health of all services
    const healthResponse = yield* Effect.promise(() => 
      fetch(`${baseUrl}/api/v2/health`).then(r => r.json())
    );
    yield* Console.log(`Health status: ${JSON.stringify(healthResponse, null, 2)}`);
    
    // Get specific service details
    const serviceResponse = yield* Effect.promise(() => 
      fetch(`${baseUrl}/api/v2/services/api-logger`).then(r => r.json())
    );
    yield* Console.log(`Service details: ${JSON.stringify(serviceResponse, null, 2)}`);
    
    // Get metrics
    const metricsResponse = yield* Effect.promise(() => 
      fetch(`${baseUrl}/metrics`).then(r => r.json())
    );
    yield* Console.log(`Metrics sample: ${JSON.stringify(metricsResponse.metrics?.counters || {}, null, 2)}`);
    
  } catch (error) {
    yield* Console.log(`API demonstration error: ${error}`);
  }
});

/**
 * Monitor services and display real-time status
 */
const monitorServices = () => Effect.gen(function* () {
  const serviceManager = yield* EffectServiceManager;
  
  yield* Console.log("=== Service Monitoring (every 30 seconds) ===");
  
  // Monitor services every 30 seconds
  yield* Effect.repeat(
    Effect.gen(function* () {
      const timestamp = new Date().toISOString();
      yield* Console.log(`\n--- Service Status at ${timestamp} ---`);
      
      const healthResults = yield* serviceManager.healthCheckAllServices();
      
      for (const [name, health] of Object.entries(healthResults)) {
        const status = health.status;
        const uptime = health.uptime ? `${Math.floor(health.uptime / 1000)}s` : "N/A";
        const restarts = health.restartCount || 0;
        
        yield* Console.log(`${name}: ${status} (uptime: ${uptime}, restarts: ${restarts})`);
        
        if (health.details?.isCronService) {
          const executions = health.details.executionCount || 0;
          const errorRate = ((health.details.errorRate || 0) * 100).toFixed(1);
          yield* Console.log(`  └─ Executions: ${executions}, Error rate: ${errorRate}%`);
        }
      }
    }),
    Schedule.fixed(30000) // Every 30 seconds
  );
});

/**
 * Main application program
 */
const program = Effect.gen(function* () {
  yield* Console.log("=== Effect API Server Example ===");
  
  // Create and configure services
  const services = yield* createApplicationServices();
  
  // Start the API server
  const port = parseInt(process.env.PORT || "3000");
  const server = yield* startAPIServer(port);
  
  // Start monitoring in the background
  const monitoringFiber = yield* Effect.fork(monitorServices());
  
  // Run API demonstration
  yield* Effect.fork(demonstrateAPI(port));
  
  yield* Console.log("Application is running. Press Ctrl+C to stop.");
  yield* Console.log("Try the following URLs:");
  yield* Console.log(`  - Service UI: http://localhost:${port}/`);
  yield* Console.log(`  - API Docs: http://localhost:${port}/scalar`);
  yield* Console.log(`  - Health: http://localhost:${port}/health`);
  yield* Console.log(`  - Metrics: http://localhost:${port}/metrics`);
  
  // Keep the application running
  yield* Effect.never;
});

/**
 * Application layer setup with enhanced observability
 */
const AppLayer = Layer.mergeAll(
  ServiceContextLive,
  EffectServiceManagerLive,
  makeObservabilityLayer({
    ...defaultObservabilityConfig,
    serviceName: "j8s-api-server",
    tracing: {
      enabled: true,
      sampleRate: 1.0
    },
    metrics: {
      enabled: true,
      collectInterval: 30000
    },
    logging: {
      enabled: true,
      level: "info"
    },
    tags: {
      environment: process.env.NODE_ENV || "development",
      version: "2.0.0"
    }
  })
);

/**
 * Run the API server example
 */
const runExample = () => {
  console.log("Starting Effect API Server Example...");
  console.log("This will start a full-featured API server with service management.");
  
  Effect.runPromise(
    program.pipe(
      Effect.provide(AppLayer),
      Effect.catchAll(error => 
        Console.log(`Application error: ${error}`).pipe(
          Effect.map(() => process.exit(1))
        )
      )
    )
  ).catch(error => {
    console.error("Failed to start API server:", error);
    process.exit(1);
  });
};

/**
 * Graceful shutdown handling
 */
const setupShutdownHandlers = () => {
  const shutdown = () => {
    console.log("\nReceived shutdown signal, shutting down gracefully...");
    
    // In a real application, you would:
    // 1. Stop accepting new requests
    // 2. Wait for existing requests to complete
    // 3. Stop all services
    // 4. Close database connections
    // 5. Clean up resources
    
    Effect.runPromise(
      Effect.gen(function* () {
        const serviceManager = yield* EffectServiceManager;
        yield* Console.log("Stopping all services...");
        yield* serviceManager.stopAllServices();
        yield* Console.log("All services stopped.");
      }).pipe(
        Effect.provide(AppLayer),
        Effect.timeout(10000) // 10 second timeout for shutdown
      )
    ).then(() => {
      console.log("Graceful shutdown completed");
      process.exit(0);
    }).catch(error => {
      console.error("Error during shutdown:", error);
      process.exit(1);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

// Set up shutdown handlers
setupShutdownHandlers();

// Run if this file is executed directly
if (require.main === module) {
  runExample();
}

export { runExample, createApplicationServices, startAPIServer };