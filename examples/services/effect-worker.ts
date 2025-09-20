/**
 * Example Effect-based worker service
 *
 * This demonstrates how to create a worker service using Effect.js
 * that can be managed by the EffectServiceManager.
 */

import { Effect, Console, Duration } from "effect";
import { effectExpose, BaseEffectService, type EffectHealthCheckResult } from "../../index";

class EffectWorkerService extends BaseEffectService {
  private taskCount = 0;
  private isRunning = false;

  start(): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      yield* Console.log(`EffectWorkerService ${this.name} starting in worker thread...`);
      this.isRunning = true;

      // Simulate worker doing periodic tasks
      const doWork = Effect.gen(this, function* () {
        while (this.isRunning) {
          this.taskCount++;
          yield* Console.log(`Worker ${this.name} - Task ${this.taskCount} completed`);

          // Simulate some work
          yield* Effect.sleep(Duration.seconds(3));

          // Simulate occasional work failure for testing restart policies
          if (this.taskCount > 0 && this.taskCount % 10 === 0) {
            const shouldFail = Math.random() < 0.2;
            if (shouldFail) {
              yield* Effect.fail(new Error(`Simulated failure at task ${this.taskCount}`));
            }
          }
        }
      });

      yield* doWork;
    });
  }

  stop(): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      yield* Console.log(`EffectWorkerService ${this.name} stopping...`);
      this.isRunning = false;
      yield* Console.log(`EffectWorkerService ${this.name} stopped. Total tasks: ${this.taskCount}`);
    });
  }

  healthCheck(): Effect.Effect<EffectHealthCheckResult, never> {
    return Effect.succeed({
      status: this.isRunning ? "running" : "stopped",
      details: {
        taskCount: this.taskCount,
        isRunning: this.isRunning,
        threadId: process.env.WORKER_THREAD_ID,
        workerData: process.env.workerData,
      },
    });
  }
}

// Expose the service - no need for manual RPC setup
effectExpose(new EffectWorkerService("effect-worker-impl"));