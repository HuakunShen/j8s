/**
 * Test to ensure the Effect-enhanced j8s maintains API compatibility
 * 
 * This test uses the EXACT same API as documented in README.md
 * to ensure developers don't need to know Effect to use j8s.
 */

import { Effect, Console, Duration } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { DevTools } from "@effect/experimental";
import { BaseService, ServiceManager } from "./index";
import type { HealthCheckResult } from "./src/interface";

// Test service using the exact same API as in README.md
class TestService extends BaseService {
  private isRunning = false;
  private workCount = 0;

  async start(): Promise<void> {
    await Effect.runPromise(Console.log("TestService started - same API as before!"));
    this.isRunning = true;
    
    // Simulate some work
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.workCount++;
      await Effect.runPromise(Console.log(`Work iteration ${this.workCount}`));
    }
    
    this.isRunning = false;
    await Effect.runPromise(Console.log("TestService work completed"));
  }

  async stop(): Promise<void> {
    await Effect.runPromise(Console.log("TestService stopped"));
    this.isRunning = false;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.isRunning ? "running" : "stopped",
      details: {
        workCount: this.workCount,
        isRunning: this.isRunning
      },
    };
  }
}

// Test cron job service
class BackupService extends BaseService {
  async start(): Promise<void> {
    await Effect.runPromise(Console.log("🔄 Running backup..."));
    
    // Simulate backup work
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate occasional failure to test retry logic
    if (Math.random() < 0.3) {
      throw new Error("Backup failed - testing Effect retry");
    }
    
    await Effect.runPromise(Console.log("✅ Backup completed"));
  }

  async stop(): Promise<void> {
    await Effect.runPromise(Console.log("Backup service stopped"));
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running",
      details: { lastBackup: new Date().toISOString() },
    };
  }
}

// Test the exact same API as documented in README.md - now with beautiful Effect logging!
const testAPICompatibility = Effect.gen(function* () {
  yield* Effect.log("🧪 Testing Effect-enhanced j8s with original API...");
  yield* Effect.log("📊 DevTools available at: http://localhost:34437");
  
  // Create a service manager - same API
  const manager = new ServiceManager();

  // Create services - same API
  const testService = new TestService("test-service");
  const backupService = new BackupService("backup-service");

  // Add services - same API
  manager.addService(testService, {
    restartPolicy: "on-failure",
    maxRetries: 3
  });

  manager.addService(backupService, {
    cronJob: {
      schedule: "*/10 * * * * *", // Every 10 seconds for demo
      timeout: 5000, // 5 second timeout
    }
  });

  // Start service - same API (wrapped in Effect for beautiful logging)
  yield* Effect.log("\n📦 Starting test service...");
  yield* Effect.tryPromise({
    try: () => manager.startService("test-service"),
    catch: (error) => new Error(`Failed to start service: ${error}`)
  }).pipe(
    Effect.withSpan("start-service", {
      attributes: { serviceName: "test-service", api: "same-as-before" }
    })
  );
  
  // Health check - same API  
  yield* Effect.log("\n🔍 Checking health...");
  const health = yield* Effect.tryPromise({
    try: () => manager.healthCheckService("test-service"),
    catch: (error) => new Error(`Health check failed: ${error}`)
  }).pipe(
    Effect.withSpan("health-check", {
      attributes: { serviceName: "test-service" }
    })
  );
  yield* Effect.log("Health:", health);

  // Start all services - same API
  yield* Effect.log("\n🚀 Starting all services...");
  yield* Effect.tryPromise({
    try: () => manager.startAllServices(),
    catch: (error) => new Error(`Failed to start all services: ${error}`)
  }).pipe(
    Effect.withSpan("start-all-services", {
      attributes: { serviceCount: 2, api: "same-promise-interface" }
    })
  );

  // Wait a bit to see cron job in action
  yield* Effect.log("\n⏳ Waiting 15 seconds to see cron job...");
  yield* Effect.sleep(Duration.seconds(15)).pipe(
    Effect.withSpan("wait-for-cron", {
      attributes: { duration: "15s", purpose: "observe-cron-jobs" }
    })
  );

  // Health check all - same API
  yield* Effect.log("\n🔍 Checking all health...");
  const allHealth = yield* Effect.tryPromise({
    try: () => manager.healthCheckAllServices(),
    catch: (error) => new Error(`Health check all failed: ${error}`)
  }).pipe(
    Effect.withSpan("health-check-all", {
      attributes: { serviceCount: 2 }
    })
  );
  yield* Effect.log("All Health:", allHealth);

  // Stop all services - same API
  yield* Effect.log("\n🛑 Stopping all services...");
  yield* Effect.tryPromise({
    try: () => manager.stopAllServices(),
    catch: (error) => new Error(`Failed to stop services: ${error}`)
  }).pipe(
    Effect.withSpan("stop-all-services", {
      attributes: { gracefulShutdown: true }
    })
  );

  yield* Effect.log("\n✅ API compatibility test passed!");
  yield* Effect.log("🎯 Effect enhancements work behind the scenes!");
  yield* Effect.log("📊 Benefits gained:");
  yield* Effect.log("  - Built-in exponential backoff with jittering");
  yield* Effect.log("  - Effect resource safety and cleanup");
  yield* Effect.log("  - Better concurrent operations");
  yield* Effect.log("  - Structured error handling");
  yield* Effect.log("  - Fiber-based state management");
}).pipe(
  Effect.withSpan("j8s-api-compatibility-test", {
    attributes: {
      testType: "api-compatibility",
      framework: "j8s-effect-enhanced",
      features: [
        "same-promise-api",
        "internal-effect-enhancements",
        "beautiful-logging"
      ]
    }
  })
)

// Run the test with beautiful Effect logging and DevTools
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("🚀 Effect-enhanced j8s API Compatibility Test");
  console.log("📊 Beautiful Effect logging + DevTools enabled!");
  console.log("🌐 DevTools available at: http://localhost:34437");
  console.log("🔍 Testing same Promise API with Effect enhancements...");
  console.log("");

  const DevToolsLive = DevTools.layer();

  const program = testAPICompatibility.pipe(
    Effect.tap(() => Effect.log("\n🎉 Effect integration successful!")),
    Effect.tap(() => Effect.log("Developers can use j8s without knowing Effect!")),
    Effect.tap(() => Effect.log("🎯 Check DevTools for detailed traces and spans!")),
    Effect.catchAll((error) => 
      Effect.logError("Test failed:", error).pipe(
        Effect.tap(() => Effect.sync(() => process.exit(1)))
      )
    )
  );

  program.pipe(
    Effect.provide(DevToolsLive),
    NodeRuntime.runMain
  );
}
