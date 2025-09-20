/**
 * Example demonstrating Effect.js integration with j8s
 *
 * This example shows how to create and manage services using Effect.js
 * for structured concurrency and functional programming patterns.
 */

import { Effect, Console, Schedule, Duration } from "effect";
import {
  BaseEffectService,
  EffectServiceManager,
  createEffectWorkerService,
  type EffectHealthCheckResult,
} from "../index";

// Example 1: Basic Effect-based service
class LoggingService extends BaseEffectService {
  private counter = 0;

  start(): Effect.Effect<void, never> {
    return Effect.gen(this, function* () {
      yield* Console.log(`LoggingService ${this.name} starting...`);

      // Simulate a long-running service with periodic logging
      const logPeriodically = Effect.gen(this, function* () {
        while (true) {
          this.counter++;
          yield* Console.log(`LoggingService ${this.name} - Count: ${this.counter}`);
          yield* Effect.sleep(Duration.seconds(2));
        }
      });

      yield* logPeriodically;
    });
  }

  stop(): Effect.Effect<void, never> {
    return Effect.gen(this, function* () {
      yield* Console.log(`LoggingService ${this.name} stopping...`);
      yield* Console.log(`Final count: ${this.counter}`);
    });
  }

  healthCheck(): Effect.Effect<EffectHealthCheckResult, never> {
    return Effect.succeed({
      status: "running",
      details: {
        counter: this.counter,
        uptime: Date.now(),
      },
    });
  }
}

// Example 2: Effect-based service with error handling
class DatabaseService extends BaseEffectService {
  private connected = false;

  start(): Effect.Effect<void, never> {
    return Effect.gen(this, function* () {
      yield* Console.log(`DatabaseService ${this.name} connecting...`);

      // Simulate connection with potential failure
      const connectWithRetry = Effect.gen(this, function* () {
        // Simulate random connection failure
        const shouldFail = Math.random() < 0.3;
        if (shouldFail) {
          yield* Effect.fail(new Error("Database connection failed"));
        }

        this.connected = true;
        yield* Console.log(`DatabaseService ${this.name} connected successfully!`);
      }).pipe(
        Effect.retry(Schedule.exponential(Duration.millis(1000), 2.0).pipe(
          Schedule.intersect(Schedule.recurs(3))
        )),
        Effect.catchAll((error) =>
          Console.error(`Failed to connect after retries: ${error.message}`)
        )
      );

      yield* connectWithRetry;

      // Keep the service running
      yield* Effect.never;
    });
  }

  stop(): Effect.Effect<void, never> {
    return Effect.gen(this, function* () {
      if (this.connected) {
        yield* Console.log(`DatabaseService ${this.name} disconnecting...`);
        this.connected = false;
        yield* Console.log(`DatabaseService ${this.name} disconnected.`);
      }
    });
  }

  healthCheck(): Effect.Effect<EffectHealthCheckResult, never> {
    return Effect.succeed({
      status: this.connected ? "running" : "stopped",
      details: {
        connected: this.connected,
        connectionTime: this.connected ? Date.now() : null,
      },
    });
  }
}

// Example 3: Effect-based batch processing service
class BatchProcessor extends BaseEffectService {
  start(): Effect.Effect<void, never> {
    return Effect.gen(this, function* () {
      yield* Console.log(`BatchProcessor ${this.name} starting batch job...`);

      // Simulate processing a batch of items
      const items = Array.from({ length: 10 }, (_, i) => `item-${i + 1}`);

      const processItem = (item: string) =>
        Effect.gen(function* () {
          yield* Console.log(`Processing ${item}...`);
          yield* Effect.sleep(Duration.millis(500));
          yield* Console.log(`Completed ${item}`);
        });

      // Process items with controlled concurrency
      yield* Effect.forEach(items, processItem, { concurrency: 3 });

      yield* Console.log(`BatchProcessor ${this.name} completed all items!`);
    });
  }

  stop(): Effect.Effect<void, never> {
    return Console.log(`BatchProcessor ${this.name} stopping...`);
  }
}

// Main demonstration function
export async function runEffectExample(): Promise<void> {
  const manager = new EffectServiceManager();

  // Create Effect-based services
  const loggingService = new LoggingService("effect-logger");
  const dbService = new DatabaseService("effect-db");
  const batchService = new BatchProcessor("effect-batch");

  // Create an Effect-based worker service
  const workerService = createEffectWorkerService(
    "effect-worker",
    new URL("./services/effect-worker.ts", import.meta.url),
    { autoTerminate: false }
  );

  console.log("🚀 Starting Effect.js j8s demonstration...\n");

  // Add services to manager with different configurations
  const setupServices = Effect.gen(function* () {
    // Long-running service with restart policy
    yield* manager.addService(loggingService, {
      restartPolicy: "always",
      maxRetries: 3,
    });

    // Service that might fail, with limited retries
    yield* manager.addService(dbService, {
      restartPolicy: "on-failure",
      maxRetries: 2,
    });

    // Batch job that runs on a schedule
    yield* manager.addService(batchService, {
      restartPolicy: "no",
      cronJob: {
        schedule: "*/30 * * * * *", // Every 30 seconds
        timeout: 15000, // 15 second timeout
      },
    });

    // Worker service
    yield* manager.addService(workerService, {
      restartPolicy: "on-failure",
      maxRetries: 1,
    });
  });

  try {
    // Run the setup
    await Effect.runPromise(setupServices);
    console.log("✅ Services configured successfully");

    // Start all services
    await Effect.runPromise(manager.startAllServices());
    console.log("✅ All services started");

    // Monitor health for a while
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const healthResults = await Effect.runPromise(
        manager.healthCheckAllServices()
      );

      console.log("\n📊 Health Check Results:");
      Object.entries(healthResults).forEach(([name, result]) => {
        console.log(`  ${name}: ${result.status}`, result.details || "");
      });
    }

    // Demonstrate stopping a specific service
    console.log("\n🛑 Stopping database service...");
    await Effect.runPromise(manager.stopService("effect-db"));

    // Final health check
    const finalHealth = await Effect.runPromise(
      manager.healthCheckAllServices()
    );
    console.log("\n📊 Final Health Check:");
    Object.entries(finalHealth).forEach(([name, result]) => {
      console.log(`  ${name}: ${result.status}`);
    });

  } catch (error) {
    console.error("❌ Error during demonstration:", error);
  } finally {
    // Clean shutdown
    console.log("\n🛑 Shutting down all services...");
    await Effect.runPromise(manager.stopAllServices());
    console.log("✅ All services stopped");
  }
}

// Run the example if this file is executed directly
if (import.meta.main) {
  runEffectExample().catch(console.error);
}