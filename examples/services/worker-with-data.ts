import { Duration, Effect } from "effect";
import { expose, type HealthCheckResult, type IService } from "../../index";
import { workerData } from "worker_threads";

class WorkerWithDataService implements IService {
  name = "workerWithDataService";
  private isRunning = false;
  private startTime = 0;
  private iterationCount = 0;
  private maxIterations: number;
  private delay: number;
  private message: string;
  private mode: string;

  constructor() {
    // Access the custom data passed from the main thread
    const config = (workerData as any)?.config || {};
    this.maxIterations = config.maxIterations || 3;
    this.delay = config.delay || 2000;
    this.message = config.message || "Default message";
    this.mode = (workerData as any)?.mode || "normal";

    console.log("Worker initialized with custom data:", {
      config,
      mode: this.mode,
    });
  }

  start() {
    return Effect.gen(this, function* () {
      console.log(`WorkerWithDataService started in ${this.mode} mode`);
      this.isRunning = true;
      this.startTime = Date.now();
      this.iterationCount = 0;

      console.log("WorkerWithDataService task started");
      yield* this.runTask();
    });
  }

  stop() {
    return Effect.sync(() => {
      console.log("WorkerWithDataService stopping");
      this.isRunning = false;
    });
  }

  healthCheck() {
    return Effect.succeed<HealthCheckResult>({
      status: this.isRunning ? "running" : "stopped",
      details: {
        uptime: this.isRunning ? (Date.now() - this.startTime) / 1000 : 0,
        iterations: this.iterationCount,
        config: {
          maxIterations: this.maxIterations,
          delay: this.delay,
          message: this.message,
        },
        mode: this.mode,
      },
    });
  }

  // Run a task using the configuration provided through workerData
  private runTask() {
    return Effect.gen(this, function* () {
      while (this.isRunning && this.iterationCount < this.maxIterations) {
        this.iterationCount++;

        if (this.mode === "verbose") {
          console.log(
            `[${this.iterationCount}/${this.maxIterations}] ${this.message}`
          );
        }

        yield* Effect.sleep(Duration.millis(this.delay));
      }

      console.log(`Task completed after ${this.iterationCount} iterations`);
    });
  }
}

// Expose the service for worker thread communication
expose(new WorkerWithDataService());
