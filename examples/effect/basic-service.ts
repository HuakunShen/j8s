/**
 * Basic Effect Service Example
 * 
 * This example demonstrates how to create and use basic Effect-based services
 * with proper error handling, observability, and lifecycle management.
 */

import { Effect, Console, Clock, Ref, Layer } from "effect";
import { BaseEffectService } from "../../src/effect/BaseEffectService";
import { EffectServiceManagerLive, ServiceContextLive } from "../../src/effect/EffectServiceManager";
import { makeObservabilityLayer, defaultObservabilityConfig } from "../../src/effect/Observability";
import { CommonRetryPolicies } from "../../src/effect/RetryPolicies";
import type { ServiceContext, EffectServiceConfig } from "../../src/effect/interfaces";
import { StartupError, ShutdownError } from "../../src/effect/errors";

/**
 * Simple service that logs messages periodically
 */
class LoggingService extends BaseEffectService {
  private readonly intervalRef = Ref.unsafeMake<NodeJS.Timeout | null>(null);
  private readonly messageCount = Ref.unsafeMake<number>(0);

  constructor(name: string, config: EffectServiceConfig = {}) {
    super(name, {
      ...config,
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { serviceType: "logging", ...config.observability?.tags }
      }
    });
  }

  protected runService(): Effect.Effect<void, StartupError, ServiceContext> {
    return Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      
      yield* Console.log(`Starting logging service: ${this.name}`);
      
      // Create interval for periodic logging
      const interval = setInterval(() => {
        Effect.runSync(
          Effect.gen(this, function* () {
            const count = yield* Ref.updateAndGet(this.messageCount, n => n + 1);
            const timestamp = yield* Clock.currentTimeMillis;
            
            yield* Console.log(`[${this.name}] Message #${count} at ${new Date(timestamp).toISOString()}`);
            
            // Record metrics
            yield* context.observabilityManager.incrementCounter(
              "logging.messages.sent", 
              { service: this.name }
            );
          })
        );
      }, 2000); // Log every 2 seconds

      yield* Ref.set(this.intervalRef, interval);
      
      yield* Console.log(`Logging service ${this.name} started successfully`);
      
      // Keep running until stopped
      yield* Effect.never;
    });
  }

  protected cleanupService(): Effect.Effect<void, ShutdownError, ServiceContext> {
    return Effect.gen(this, function* () {
      yield* Console.log(`Stopping logging service: ${this.name}`);
      
      const interval = yield* Ref.get(this.intervalRef);
      if (interval) {
        clearInterval(interval);
        yield* Ref.set(this.intervalRef, null);
      }
      
      const totalMessages = yield* Ref.get(this.messageCount);
      yield* Console.log(`Logging service ${this.name} stopped. Total messages: ${totalMessages}`);
    });
  }

  // Custom method to get message statistics
  getMessageStats(): Effect.Effect<{ count: number; averageRate: number }, never, never> {
    return Effect.gen(this, function* () {
      const count = yield* Ref.get(this.messageCount);
      const uptime = yield* Ref.get(this.startTime).pipe(
        Effect.map(startTime => startTime ? Date.now() - startTime.getTime() : 0)
      );
      
      const averageRate = uptime > 0 ? (count / uptime) * 1000 * 60 : 0; // messages per minute
      
      return { count, averageRate };
    });
  }
}

/**
 * Database simulation service with retry policies
 */
class DatabaseService extends BaseEffectService {
  private readonly connections = Ref.unsafeMake<number>(0);
  private readonly maxConnections = 10;
  
  constructor(name: string, config: EffectServiceConfig = {}) {
    super(name, {
      ...config,
      retryPolicy: CommonRetryPolicies.database,
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { serviceType: "database", ...config.observability?.tags }
      }
    });
  }

  protected runService(): Effect.Effect<void, StartupError, ServiceContext> {
    return Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      
      yield* Console.log(`Initializing database service: ${this.name}`);
      
      // Simulate database connection initialization
      yield* Effect.sleep(1000);
      
      // Simulate potential connection failure (20% chance)
      const random = Math.random();
      if (random < 0.2) {
        return yield* Effect.fail(new StartupError({
          message: `Database connection failed for ${this.name}`,
          phase: "initialization"
        }));
      }
      
      yield* Ref.set(this.connections, this.maxConnections);
      
      yield* context.observabilityManager.setGauge(
        "database.connections.active",
        this.maxConnections,
        { service: this.name }
      );
      
      yield* Console.log(`Database service ${this.name} connected with ${this.maxConnections} connections`);
      
      // Keep running
      yield* Effect.never;
    });
  }

  protected cleanupService(): Effect.Effect<void, ShutdownError, ServiceContext> {
    return Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      
      yield* Console.log(`Closing database connections for: ${this.name}`);
      
      // Simulate graceful connection closing
      const currentConnections = yield* Ref.get(this.connections);
      for (let i = currentConnections; i > 0; i--) {
        yield* Effect.sleep(100); // Simulate connection closing time
        yield* Ref.set(this.connections, i - 1);
        
        yield* context.observabilityManager.setGauge(
          "database.connections.active",
          i - 1,
          { service: this.name }
        );
      }
      
      yield* Console.log(`Database service ${this.name} closed all connections`);
    });
  }

  // Simulate database query
  query(sql: string): Effect.Effect<any[], Error, ServiceContext> {
    return Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      const connections = yield* Ref.get(this.connections);
      
      if (connections === 0) {
        return yield* Effect.fail(new Error("No database connections available"));
      }
      
      yield* context.observabilityManager.incrementCounter(
        "database.queries.total",
        { service: this.name, type: "select" }
      );
      
      // Simulate query execution time
      yield* Effect.sleep(100 + Math.random() * 200);
      
      // Simulate query results
      return [{ id: 1, data: "sample" }, { id: 2, data: "result" }];
    });
  }
}

/**
 * Main program demonstrating basic Effect services
 */
const program = Effect.gen(function* () {
  yield* Console.log("=== Basic Effect Services Example ===");
  
  // Get the service manager
  const serviceManager = yield* EffectServiceManager;
  
  // Create services
  const loggingService = new LoggingService("main-logger");
  const databaseService = new DatabaseService("primary-db");
  
  // Add services to manager
  yield* serviceManager.addService(loggingService);
  yield* serviceManager.addService(databaseService);
  
  yield* Console.log("Services added to manager");
  
  // Start all services
  yield* Console.log("Starting all services...");
  yield* serviceManager.startAllServices();
  
  yield* Console.log("All services started!");
  
  // Let services run for a while
  yield* Effect.sleep(10000);
  
  // Perform health checks
  yield* Console.log("Performing health checks...");
  const healthResults = yield* serviceManager.healthCheckAllServices();
  
  for (const [name, health] of Object.entries(healthResults)) {
    yield* Console.log(`Service ${name}: ${health.status}`);
  }
  
  // Test database query
  try {
    yield* Console.log("Testing database query...");
    const results = yield* databaseService.query("SELECT * FROM users");
    yield* Console.log(`Query results: ${JSON.stringify(results)}`);
  } catch (error) {
    yield* Console.log(`Query failed: ${error}`);
  }
  
  // Get logging service statistics
  const stats = yield* loggingService.getMessageStats();
  yield* Console.log(`Logging stats: ${stats.count} messages, ${stats.averageRate.toFixed(2)} msgs/min`);
  
  // Stop all services
  yield* Console.log("Stopping all services...");
  yield* serviceManager.stopAllServices();
  
  yield* Console.log("All services stopped successfully!");
});

/**
 * Application layer setup
 */
const AppLayer = Layer.mergeAll(
  ServiceContextLive,
  EffectServiceManagerLive,
  makeObservabilityLayer({
    ...defaultObservabilityConfig,
    serviceName: "basic-services-example"
  })
);

/**
 * Run the example
 */
const runExample = () => {
  console.log("Starting Basic Effect Services Example...");
  
  Effect.runPromise(
    program.pipe(
      Effect.provide(AppLayer),
      Effect.catchAll(error => 
        Console.log(`Application error: ${error}`).pipe(
          Effect.map(() => process.exit(1))
        )
      )
    )
  ).then(() => {
    console.log("Example completed successfully");
    process.exit(0);
  }).catch(error => {
    console.error("Example failed:", error);
    process.exit(1);
  });
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log("\nReceived SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Run if this file is executed directly
if (require.main === module) {
  runExample();
}

export { LoggingService, DatabaseService, runExample };