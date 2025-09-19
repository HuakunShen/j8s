import { Duration, Effect } from "effect";
import { expose, type HealthCheckResult, type IService } from "../../index";

class WorkerFailureService implements IService {
  name = "workerFailureService";
  private isRunning = false;
  private isStopped = false;
  private startTime = 0;
  private iterationCount = 0;

  start() {
    return Effect.gen(this, function* () {
      console.log("WorkerFailureService started");
      this.isRunning = true;
      this.isStopped = false;
      this.startTime = Date.now();
      this.iterationCount = 0;

      yield* this.runLongRunningTask();

      console.log("WorkerFailureService task completed");
    });
  }

  stop() {
    return Effect.sync(() => {
      console.log("WorkerFailureService stopping");
      this.isStopped = true;
      this.isRunning = false;
    });
  }

  healthCheck() {
    return Effect.succeed<HealthCheckResult>({
      status: this.isRunning ? "running" : "stopped",
      details: {
        uptime: this.isRunning ? (Date.now() - this.startTime) / 1000 : 0,
        iterations: this.iterationCount,
      },
    });
  }

  // Simulates a long-running task that will likely fail
  private runLongRunningTask() {
    return Effect.gen(this, function* () {
      while (!this.isStopped) {
        yield* Effect.sleep(Duration.seconds(1));
        this.iterationCount++;
        console.log(`Worker iteration ${this.iterationCount}`);

        const random = Math.random();
        console.log(`Worker random number: ${random}`);

        if (random < 0.3) {
          yield* Effect.fail(
            new Error(
              `Worker random failure at iteration ${this.iterationCount}`
            )
          );
        }

        if (this.iterationCount >= 5) {
          console.log("Worker task completed successfully after 5 iterations");
          return;
        }
      }

      console.log("Worker task stopped gracefully");
    });
  }
}

// Expose the service for worker thread communication
expose(new WorkerFailureService());
