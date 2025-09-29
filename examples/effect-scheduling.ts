/**
 * Effect-based Service Scheduling Example
 *
 * This example demonstrates how to use Effect's powerful scheduling capabilities
 * instead of traditional cron expressions. Effect provides more flexible and
 * composable scheduling patterns that integrate seamlessly with j8s.
 */

import { Effect, Schedule, Duration } from "effect";
import { BaseService, ServiceManager, type ScheduledJobConfig, type HealthCheckResult } from "../index";

// Example service that runs on a schedule
class DataBackupService extends BaseService {
  private lastBackupTime?: Date;
  private backupCount = 0;

  async start(): Promise<void> {
    console.log(`📦 Starting backup ${this.backupCount + 1}...`);

    // Simulate backup work
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    this.lastBackupTime = new Date();
    this.backupCount++;
    console.log(`✅ Backup ${this.backupCount} completed at ${this.lastBackupTime.toISOString()}`);
  }

  async stop(): Promise<void> {
    console.log("🛑 Backup service cleanup");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running", // Always running for scheduled jobs
      details: {
        lastBackupTime: this.lastBackupTime?.toISOString(),
        backupCount: this.backupCount,
      },
    };
  }
}

class ReportGenerationService extends BaseService {
  private reportsGenerated = 0;

  async start(): Promise<void> {
    this.reportsGenerated++;
    console.log(`📊 Generating daily report #${this.reportsGenerated}...`);

    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 800));

    console.log(`✅ Daily report #${this.reportsGenerated} generated`);
  }

  async stop(): Promise<void> {
    console.log("🛑 Report service cleanup");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running",
      details: {
        reportsGenerated: this.reportsGenerated,
        lastReport: new Date().toISOString(),
      },
    };
  }
}

class CleanupService extends BaseService {
  private cleanupRuns = 0;

  async start(): Promise<void> {
    this.cleanupRuns++;
    console.log(`🧹 Running cleanup task #${this.cleanupRuns}...`);

    // Simulate cleanup work
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`✅ Cleanup task #${this.cleanupRuns} completed`);
  }

  async stop(): Promise<void> {
    console.log("🛑 Cleanup service stopped");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "running",
      details: {
        cleanupRuns: this.cleanupRuns,
        lastCleanup: new Date().toISOString(),
      },
    };
  }
}

// Example 1: Basic scheduling with Effect schedules
async function basicSchedulingExample() {
  console.log("🎯 Basic Effect Scheduling Example\n");

  const serviceManager = new ServiceManager();

  // Create services with different schedules
  const backupService = new DataBackupService("backup-service");
  const reportService = new ReportGenerationService("report-service");

  // Schedule configurations using Effect's Schedule
  const backupConfig: ScheduledJobConfig = {
    // Run every 3 seconds
    schedule: Schedule.spaced(Duration.seconds(3)),
    timeout: Duration.seconds(5), // Timeout if backup takes too long
  };

  const reportConfig: ScheduledJobConfig = {
    // Run every 5 seconds with exponential delay
    schedule: Schedule.exponential(Duration.seconds(5)),
    timeout: Duration.seconds(3),
  };

  // Add services with scheduling
  serviceManager.addService(backupService, { scheduledJob: backupConfig });
  serviceManager.addService(reportService, { scheduledJob: reportConfig });

  console.log("📋 Scheduled services:");
  serviceManager.services.forEach(service => {
    console.log(`  - ${service.name}`);
  });

  const program = Effect.gen(function* () {
    console.log("\n🚀 Starting scheduled services...");

    // The services will start their schedules automatically
    // We can still use Effect-based operations for management
    const healthResults = yield* serviceManager.healthCheckAllServicesEffect();

    console.log("\n📊 Initial health status:");
    Object.entries(healthResults).forEach(([name, health]) => {
      console.log(`  - ${name}: ${health.status}`);
      console.log(`    Details: ${JSON.stringify(health.details, null, 4)}`);
    });

    // Let services run for a while
    console.log("\n⏱️  Letting scheduled services run for 15 seconds...");
    yield* Effect.sleep(Duration.seconds(15));

    // Check health again
    const finalHealthResults = yield* serviceManager.healthCheckAllServicesEffect();

    console.log("\n📊 Final health status after 15 seconds:");
    Object.entries(finalHealthResults).forEach(([name, health]) => {
      console.log(`  - ${name}: ${health.status}`);
      console.log(`    Details: ${JSON.stringify(health.details, null, 4)}`);
    });

    return "Basic scheduling example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Basic scheduling example failed:", error);
  } finally {
    // Clean shutdown
    await serviceManager.stopAllServices();
  }
}

// Example 2: Advanced scheduling patterns
async function advancedSchedulingExample() {
  console.log("\n\n🎯 Advanced Effect Scheduling Patterns\n");

  const serviceManager = new ServiceManager();
  const cleanupService = new CleanupService("cleanup-service");

  // Advanced scheduling patterns
  const advancedConfigs = [
    {
      name: "fibonacci-cleanup",
      config: {
        scheduledJob: {
          // Fibonacci sequence delays: 1, 1, 2, 3, 5, 8... seconds
          schedule: Schedule.fibonacci(Duration.seconds(1)),
          timeout: Duration.seconds(2),
        },
      },
    },
    {
      name: "linear-cleanup",
      config: {
        scheduledJob: {
          // Linear backoff: 1, 2, 3, 4, 5... seconds
          schedule: Schedule.linear(Duration.seconds(1)),
          timeout: Duration.seconds(2),
        },
      },
    },
    {
      name: "capped-exponential-cleanup",
      config: {
        scheduledJob: {
          // Exponential backoff capped at 8 seconds
          schedule: Schedule.exponential(Duration.seconds(1)).pipe(
            Schedule.either(Schedule.spaced(Duration.seconds(8)))
          ),
          timeout: Duration.seconds(3),
        },
      },
    },
  ];

  const program = Effect.gen(function* () {
    console.log("🔧 Setting up advanced scheduling patterns...");

    // Demonstrate different patterns one by one
    for (const { name, config } of advancedConfigs) {
      console.log(`\n📋 Testing ${name} pattern...`);

      const testService = new CleanupService(name);
      serviceManager.addService(testService, config);

      console.log(`⏱️  Running ${name} for 10 seconds...`);
      yield* Effect.sleep(Duration.seconds(10));

      // Check results
      const health = yield* serviceManager.healthCheckServiceEffect(name);
      console.log(`📊 ${name} health:`, health.details);

      // Remove service before testing next pattern
      serviceManager.removeService(name);
      console.log(`🗑️  Removed ${name}`);
    }

    return "Advanced scheduling patterns completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Advanced scheduling example failed:", error);
  } finally {
    await serviceManager.stopAllServices();
  }
}

// Example 3: Composite schedules
async function compositeSchedulingExample() {
  console.log("\n\n🎯 Composite Scheduling Example\n");

  const serviceManager = new ServiceManager();
  const compositeService = new DataBackupService("composite-backup");

  const program = Effect.gen(function* () {
    console.log("🔧 Setting up composite schedule patterns...");

    // Composite schedule: exponential backoff with maximum interval and recurrence limit
    const compositeSchedule = Schedule.exponential(Duration.seconds(1)).pipe(
      // Cap the maximum delay at 4 seconds
      Schedule.either(Schedule.spaced(Duration.seconds(4))),
      // Add jitter to avoid thundering herd
      Schedule.jittered,
      // Limit to 5 executions
      Schedule.intersect(Schedule.recurs(4)) // 0-based, so 4 means 5 executions
    );

    const compositeConfig: ScheduledJobConfig = {
      schedule: compositeSchedule,
      timeout: Duration.seconds(10),
    };

    serviceManager.addService(compositeService, { scheduledJob: compositeConfig });

    console.log("⏱️  Running composite schedule for 20 seconds...");
    console.log("   Expected: ~5 executions with jittered exponential backoff");

    yield* Effect.sleep(Duration.seconds(20));

    const health = yield* serviceManager.healthCheckServiceEffect("composite-backup");
    console.log(`📊 Composite backup results:`, health.details);

    return "Composite scheduling example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Composite scheduling example failed:", error);
  } finally {
    await serviceManager.stopAllServices();
  }
}

// Main execution
if (import.meta.main) {
  await basicSchedulingExample();
  await advancedSchedulingExample();
  await compositeSchedulingExample();

  console.log("\n🎉 All Effect scheduling examples completed!");
  console.log("\n💡 Key Benefits of Effect Scheduling:");
  console.log("  ✅ Type-safe schedule definitions");
  console.log("  ✅ Composable schedule patterns");
  console.log("  ✅ Built-in timeout handling");
  console.log("  ✅ Fiber-based cancellation");
  console.log("  ✅ No external cron dependencies");
  console.log("  ✅ Seamless Effect integration");
}

export {
  basicSchedulingExample,
  advancedSchedulingExample,
  compositeSchedulingExample,
};