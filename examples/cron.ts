/**
 * Simple Cron Job Example with Effect
 *
 * This example demonstrates how to create a simple scheduled service
 * using j8s with Effect's scheduling capabilities.
 */

import { Effect, Schedule, Duration } from "effect";
import { BaseService, ServiceManager } from "../index";
import type { HealthCheckResult } from "../index";

// Simple backup service that runs on a schedule
class BackupService extends BaseService {
  private backupCount = 0;
  private lastBackupTime?: Date;

  async start(): Promise<void> {
    this.backupCount++;
    console.log(`📦 Starting backup #${this.backupCount}...`);
    
    // Simulate backup work
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.lastBackupTime = new Date();
    console.log(`✅ Backup #${this.backupCount} completed at ${this.lastBackupTime.toISOString()}`);
  }

  async stop(): Promise<void> {
    console.log("🛑 Backup service stopped");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running",
      details: {
        backupCount: this.backupCount,
        lastBackupTime: this.lastBackupTime?.toISOString(),
      },
    };
  }
}

// Simple example function
async function simpleCronExample() {
  console.log("🎯 Starting Simple Cron Job Example\n");

  // Create service manager and backup service
  const serviceManager = new ServiceManager();
  const backupService = new BackupService("backup-service");

  // Add service with scheduled job configuration
  serviceManager.addService(backupService, {
    scheduledJob: {
      schedule: Schedule.spaced(Duration.seconds(5)), // Run every 5 seconds
      timeout: Duration.seconds(3), // Timeout after 3 seconds
    },
  });

  console.log("📋 Service registered with scheduled job");
  console.log("⏱️  Will run every 5 seconds with 3 second timeout\n");

  // Using Effect-based APIs for service management
  const program = Effect.gen(function* () {
    console.log("🚀 Starting backup service...");
    
    // Start the service using Effect API
    yield* serviceManager.startServiceEffect("backup-service");
    console.log("✅ Backup service started successfully\n");

    // Let it run for 20 seconds
    console.log("⏱️  Letting service run for 20 seconds...");
    yield* Effect.sleep(Duration.seconds(20));

    // Check health using Effect API
    console.log("\n🔍 Checking service health...");
    const health = yield* serviceManager.healthCheckServiceEffect("backup-service");
    console.log("📊 Health status:", health.status);
    console.log("📊 Details:", health.details);

    // Stop the service using Effect API
    console.log("\n🛑 Stopping backup service...");
    yield* serviceManager.stopServiceEffect("backup-service");
    console.log("✅ Backup service stopped successfully");

    return "🎉 Simple cron example completed successfully!";
  });

  // Run the Effect program
  try {
    const result = await Effect.runPromise(program);
    console.log(`\n${result}`);
  } catch (error) {
    console.error("❌ Error running Effect program:", error);
  }
}

// Alternative schedule examples
async function alternativeScheduleExamples() {
  console.log("\n\n🎯 Alternative Schedule Examples\n");

  const serviceManager = new ServiceManager();
  
  // Create services with different schedules
  const frequentBackupService = new BackupService("frequent-backup");
  const hourlyBackupService = new BackupService("hourly-backup");

  // Example 1: Run every 3 seconds
  serviceManager.addService(frequentBackupService, {
    scheduledJob: {
      schedule: Schedule.spaced(Duration.seconds(3)),
      timeout: Duration.seconds(2),
    },
  });

  // Example 2: Run every hour (using cron expression)
  serviceManager.addService(hourlyBackupService, {
    scheduledJob: {
      schedule: Schedule.cron("0 * * * *"), // At minute 0 of every hour
      timeout: Duration.minutes(5),
    },
  });

  const program = Effect.gen(function* () {
    console.log("🚀 Starting services with different schedules...");
    
    // Start both services
    yield* serviceManager.startServiceEffect("frequent-backup");
    yield* serviceManager.startServiceEffect("hourly-backup");
    console.log("✅ Both services started\n");

    // Let them run for 10 seconds
    console.log("⏱️  Letting services run for 10 seconds...");
    yield* Effect.sleep(Duration.seconds(10));

    // Check health of both services
    console.log("\n🔍 Checking health of both services...");
    const frequentHealth = yield* serviceManager.healthCheckServiceEffect("frequent-backup");
    const hourlyHealth = yield* serviceManager.healthCheckServiceEffect("hourly-backup");
    
    console.log("📊 Frequent backup service:");
    console.log(`   Status: ${frequentHealth.status}`);
    console.log(`   Details: ${JSON.stringify(frequentHealth.details, null, 2)}`);
    
    console.log("📊 Hourly backup service:");
    console.log(`   Status: ${hourlyHealth.status}`);
    console.log(`   Details: ${JSON.stringify(hourlyHealth.details, null, 2)}`);

    // Stop both services
    console.log("\n🛑 Stopping both services...");
    yield* serviceManager.stopServiceEffect("frequent-backup");
    yield* serviceManager.stopServiceEffect("hourly-backup");
    console.log("✅ Both services stopped successfully");

    return "🎉 Alternative schedule examples completed!";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(`\n${result}`);
  } catch (error) {
    console.error("❌ Error running alternative schedule examples:", error);
  }
}

// Main execution
if (import.meta.main) {
  await simpleCronExample();
  await alternativeScheduleExamples();
  
  console.log("\n🎉 All cron job examples completed!");
  console.log("\n💡 Key Benefits of Effect-based Scheduling:");
  console.log("  ✅ Type-safe schedule definitions");
  console.log("  ✅ Composable schedule patterns");
  console.log("  ✅ Built-in timeout handling");
  console.log("  ✅ Effect-based service management");
}

export { simpleCronExample, alternativeScheduleExamples };
