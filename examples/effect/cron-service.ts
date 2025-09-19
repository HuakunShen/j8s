/**
 * Effect Cron Service Example
 * 
 * This example demonstrates how to create and use Effect-based cron services
 * with sophisticated scheduling, error handling, and overlap prevention.
 */

import { Effect, Console, Clock, Ref, Layer } from "effect";
import { EffectCronService } from "../../src/effect/EffectCronService";
import { EffectServiceManagerLive, ServiceContextLive } from "../../src/effect/EffectServiceManager";
import { makeObservabilityLayer, defaultObservabilityConfig } from "../../src/effect/Observability";
import { CommonRetryPolicies } from "../../src/effect/RetryPolicies";
import type { ServiceContext, EffectServiceConfig } from "../../src/effect/interfaces";
import type { EffectCronConfig } from "../../src/effect/EffectCronService";

/**
 * Daily backup service that runs at 2 AM every day
 */
class BackupService extends EffectCronService {
  private readonly backupCount = Ref.unsafeMake<number>(0);
  
  constructor(name: string) {
    const cronConfig: EffectCronConfig = {
      schedule: "0 0 2 * * *", // 2:00 AM every day
      timezone: "America/New_York",
      timeout: 30 * 60 * 1000, // 30 minutes timeout
      overlapPolicy: "skip", // Skip if previous backup is still running
      errorPolicy: "continue", // Continue with next scheduled backup even if one fails
      maxExecutions: undefined // Run indefinitely
    };

    const serviceConfig: EffectServiceConfig = {
      retryPolicy: CommonRetryPolicies.conservative,
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { 
          serviceType: "backup",
          schedule: "daily",
          priority: "high"
        }
      }
    };

    super(name, cronConfig, serviceConfig);
  }

  protected executeTask(): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      const backupId = yield* Ref.updateAndGet(this.backupCount, n => n + 1);
      
      yield* Console.log(`Starting backup #${backupId} at ${new Date().toISOString()}`);
      
      // Simulate backup phases
      yield* this.backupDatabases(backupId, context);
      yield* this.backupFiles(backupId, context);
      yield* this.cleanupOldBackups(backupId, context);
      yield* this.verifyBackup(backupId, context);
      
      yield* Console.log(`Backup #${backupId} completed successfully`);
      
      // Record successful backup
      yield* context.observabilityManager.incrementCounter(
        "backup.completed",
        { service: this.name, type: "daily" }
      );
    });
  }

  private backupDatabases(backupId: number, context: ServiceContext): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log(`[Backup #${backupId}] Backing up databases...`);
      
      // Simulate database backup time
      yield* Effect.sleep(5000);
      
      // Simulate occasional failure (5% chance)
      if (Math.random() < 0.05) {
        return yield* Effect.fail(new Error("Database backup failed due to lock timeout"));
      }
      
      yield* context.observabilityManager.incrementCounter(
        "backup.database.completed",
        { backup_id: String(backupId) }
      );
      
      yield* Console.log(`[Backup #${backupId}] Database backup completed`);
    });
  }

  private backupFiles(backupId: number, context: ServiceContext): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log(`[Backup #${backupId}] Backing up files...`);
      
      // Simulate file backup time
      yield* Effect.sleep(8000);
      
      yield* context.observabilityManager.incrementCounter(
        "backup.files.completed",
        { backup_id: String(backupId) }
      );
      
      yield* Console.log(`[Backup #${backupId}] File backup completed`);
    });
  }

  private cleanupOldBackups(backupId: number, context: ServiceContext): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log(`[Backup #${backupId}] Cleaning up old backups...`);
      
      // Simulate cleanup time
      yield* Effect.sleep(2000);
      
      yield* context.observabilityManager.incrementCounter(
        "backup.cleanup.completed",
        { backup_id: String(backupId) }
      );
      
      yield* Console.log(`[Backup #${backupId}] Cleanup completed`);
    });
  }

  private verifyBackup(backupId: number, context: ServiceContext): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log(`[Backup #${backupId}] Verifying backup integrity...`);
      
      // Simulate verification time
      yield* Effect.sleep(3000);
      
      // Simulate verification failure (2% chance)
      if (Math.random() < 0.02) {
        return yield* Effect.fail(new Error("Backup verification failed - corrupted archive"));
      }
      
      yield* context.observabilityManager.incrementCounter(
        "backup.verification.completed",
        { backup_id: String(backupId) }
      );
      
      yield* Console.log(`[Backup #${backupId}] Verification completed`);
    });
  }

  // Method to get backup statistics
  getBackupStats(): Effect.Effect<{ totalBackups: number; lastBackup?: Date }, never, never> {
    return Effect.gen(this, function* () {
      const count = yield* Ref.get(this.backupCount);
      const health = yield* this.healthCheck();
      
      return {
        totalBackups: count,
        lastBackup: health.details?.lastExecution
      };
    });
  }
}

/**
 * Report generation service that runs every 15 minutes during business hours
 */
class ReportService extends EffectCronService {
  constructor(name: string) {
    const cronConfig: EffectCronConfig = {
      schedule: "0 */15 9-17 * * 1-5", // Every 15 minutes, 9 AM to 5 PM, Monday to Friday
      timezone: "America/New_York",
      timeout: 5 * 60 * 1000, // 5 minutes timeout
      overlapPolicy: "queue", // Queue if previous report is still generating
      errorPolicy: "retry", // Retry on failure
      retryAttempts: 2,
      maxExecutions: undefined
    };

    const serviceConfig: EffectServiceConfig = {
      retryPolicy: CommonRetryPolicies.quickRetry,
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { 
          serviceType: "reporting",
          schedule: "business-hours",
          priority: "medium"
        }
      }
    };

    super(name, cronConfig, serviceConfig);
  }

  protected executeTask(): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      const timestamp = new Date().toISOString();
      
      yield* Console.log(`Generating report at ${timestamp}`);
      
      // Simulate report generation phases
      yield* this.collectData(context);
      yield* this.processData(context);
      yield* this.generateVisualization(context);
      yield* this.publishReport(context);
      
      yield* Console.log(`Report generated successfully at ${timestamp}`);
      
      yield* context.observabilityManager.incrementCounter(
        "reports.generated",
        { service: this.name, type: "business-hours" }
      );
    });
  }

  private collectData(context: ServiceContext): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log("Collecting data for report...");
      yield* Effect.sleep(1000);
      
      // Simulate data collection failure (10% chance)
      if (Math.random() < 0.1) {
        return yield* Effect.fail(new Error("Data collection failed - database timeout"));
      }
      
      yield* context.observabilityManager.incrementCounter("reports.data.collected");
      yield* Console.log("Data collection completed");
    });
  }

  private processData(context: ServiceContext): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log("Processing collected data...");
      yield* Effect.sleep(2000);
      
      yield* context.observabilityManager.incrementCounter("reports.data.processed");
      yield* Console.log("Data processing completed");
    });
  }

  private generateVisualization(context: ServiceContext): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log("Generating visualizations...");
      yield* Effect.sleep(1500);
      
      yield* context.observabilityManager.incrementCounter("reports.visualizations.generated");
      yield* Console.log("Visualization generation completed");
    });
  }

  private publishReport(context: ServiceContext): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log("Publishing report...");
      yield* Effect.sleep(500);
      
      yield* context.observabilityManager.incrementCounter("reports.published");
      yield* Console.log("Report published successfully");
    });
  }
}

/**
 * System cleanup service that runs every hour
 */
class CleanupService extends EffectCronService {
  constructor(name: string) {
    const cronConfig: EffectCronConfig = {
      schedule: "0 0 * * * *", // Every hour at the top of the hour
      timeout: 10 * 60 * 1000, // 10 minutes timeout
      overlapPolicy: "terminate", // Terminate previous cleanup if it's taking too long
      errorPolicy: "continue", // Continue with next cleanup even if one fails
      runOnInit: true // Run immediately when service starts
    };

    const serviceConfig: EffectServiceConfig = {
      observability: {
        enableTracing: true,
        enableMetrics: true,
        tags: { 
          serviceType: "maintenance",
          schedule: "hourly",
          priority: "low"
        }
      }
    };

    super(name, cronConfig, serviceConfig);
  }

  protected executeTask(): Effect.Effect<void, Error, ServiceContext> {
    return Effect.gen(this, function* () {
      const context = yield* ServiceContext;
      
      yield* Console.log("Starting system cleanup...");
      
      // Perform various cleanup tasks
      yield* this.cleanTempFiles(context);
      yield* this.clearCache(context);
      yield* this.compactLogs(context);
      yield* this.updateSystemStats(context);
      
      yield* Console.log("System cleanup completed");
      
      yield* context.observabilityManager.incrementCounter(
        "cleanup.completed",
        { service: this.name }
      );
    });
  }

  private cleanTempFiles(context: ServiceContext): Effect.Effect<void, never, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log("Cleaning temporary files...");
      yield* Effect.sleep(1000);
      
      const filesDeleted = Math.floor(Math.random() * 50) + 10;
      yield* context.observabilityManager.setGauge(
        "cleanup.temp_files.deleted",
        filesDeleted
      );
      
      yield* Console.log(`Deleted ${filesDeleted} temporary files`);
    });
  }

  private clearCache(context: ServiceContext): Effect.Effect<void, never, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log("Clearing application cache...");
      yield* Effect.sleep(500);
      
      const cacheCleared = Math.floor(Math.random() * 100) + 50; // MB
      yield* context.observabilityManager.setGauge(
        "cleanup.cache.cleared_mb",
        cacheCleared
      );
      
      yield* Console.log(`Cleared ${cacheCleared}MB of cache`);
    });
  }

  private compactLogs(context: ServiceContext): Effect.Effect<void, never, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log("Compacting log files...");
      yield* Effect.sleep(2000);
      
      const logsCompacted = Math.floor(Math.random() * 10) + 1;
      yield* context.observabilityManager.setGauge(
        "cleanup.logs.compacted",
        logsCompacted
      );
      
      yield* Console.log(`Compacted ${logsCompacted} log files`);
    });
  }

  private updateSystemStats(context: ServiceContext): Effect.Effect<void, never, ServiceContext> {
    return Effect.gen(function* () {
      yield* Console.log("Updating system statistics...");
      yield* Effect.sleep(800);
      
      // Simulate system metrics
      const cpuUsage = Math.random() * 100;
      const memoryUsage = Math.random() * 100;
      const diskUsage = Math.random() * 100;
      
      yield* context.observabilityManager.setGauge("system.cpu.usage_percent", cpuUsage);
      yield* context.observabilityManager.setGauge("system.memory.usage_percent", memoryUsage);
      yield* context.observabilityManager.setGauge("system.disk.usage_percent", diskUsage);
      
      yield* Console.log(`System stats updated - CPU: ${cpuUsage.toFixed(1)}%, Memory: ${memoryUsage.toFixed(1)}%, Disk: ${diskUsage.toFixed(1)}%`);
    });
  }
}

/**
 * Main program demonstrating Effect cron services
 */
const program = Effect.gen(function* () {
  yield* Console.log("=== Effect Cron Services Example ===");
  
  const serviceManager = yield* EffectServiceManager;
  
  // Create cron services
  const backupService = new BackupService("daily-backup");
  const reportService = new ReportService("business-reports");  
  const cleanupService = new CleanupService("system-cleanup");
  
  // Add services to manager
  yield* serviceManager.addService(backupService);
  yield* serviceManager.addService(reportService);
  yield* serviceManager.addService(cleanupService);
  
  yield* Console.log("Cron services added to manager");
  
  // Start all services
  yield* Console.log("Starting all cron services...");
  yield* serviceManager.startAllServices();
  
  yield* Console.log("All cron services started and scheduled!");
  
  // Let services run for a while to see some executions
  yield* Console.log("Letting services run for 60 seconds...");
  yield* Effect.sleep(60000);
  
  // Check service health and statistics
  yield* Console.log("Checking service health and statistics...");
  
  const healthResults = yield* serviceManager.healthCheckAllServices();
  for (const [name, health] of Object.entries(healthResults)) {
    yield* Console.log(`Service ${name}: ${health.status}`);
    if (health.details?.isCronService) {
      yield* Console.log(`  - Executions: ${health.details.executionCount}`);
      yield* Console.log(`  - Last execution: ${health.details.lastExecution}`);
      yield* Console.log(`  - Next execution: ${health.details.nextExecution}`);
      yield* Console.log(`  - Error rate: ${(health.details.errorRate * 100).toFixed(2)}%`);
    }
  }
  
  // Get backup service specific stats
  const backupStats = yield* backupService.getBackupStats();
  yield* Console.log(`Backup service stats: ${backupStats.totalBackups} backups completed`);
  
  // Stop all services
  yield* Console.log("Stopping all services...");
  yield* serviceManager.stopAllServices();
  
  yield* Console.log("All cron services stopped successfully!");
});

/**
 * Application layer setup
 */
const AppLayer = Layer.mergeAll(
  ServiceContextLive,
  EffectServiceManagerLive,
  makeObservabilityLayer({
    ...defaultObservabilityConfig,
    serviceName: "cron-services-example"
  })
);

/**
 * Run the example
 */
const runExample = () => {
  console.log("Starting Effect Cron Services Example...");
  
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

// Run if this file is executed directly
if (require.main === module) {
  runExample();
}

export { BackupService, ReportService, CleanupService, runExample };