import { expose, type HealthCheckResult, type IService } from "../../index";

class WorkerFailureService implements IService {
  name = "workerFailureService";
  private isRunning = false;
  private isStopped = false;
  private startTime = 0;
  private iterationCount = 0;

  async start(): Promise<void> {
    console.log("WorkerFailureService started");
    this.isRunning = true;
    this.isStopped = false;
    this.startTime = Date.now();
    this.iterationCount = 0;

    // Long-running task that will likely fail
    await this.runLongRunningTask();

    console.log("WorkerFailureService task completed");
  }

  async stop(): Promise<void> {
    console.log("WorkerFailureService stopping");
    this.isStopped = true;
    this.isRunning = false;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: this.isRunning ? "running" : "stopped",
      details: {
        uptime: this.isRunning ? (Date.now() - this.startTime) / 1000 : 0,
        iterations: this.iterationCount,
      },
    };
  }

  // Simulates a long-running task that will likely fail
  private async runLongRunningTask(): Promise<void> {
    // Run until stopped or until it fails
    while (!this.isStopped) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this.iterationCount++;
      console.log(`Worker iteration ${this.iterationCount}`);

      const random = Math.random();
      console.log(`Worker random number: ${random}`);

      // High chance of failure (80%) to test restart policy
      if (random < 0.3) {
        throw new Error(
          `Worker random failure at iteration ${this.iterationCount}`
        );
      }

      // If we reach 5 iterations, end the task naturally
      if (this.iterationCount >= 5) {
        console.log("Worker task completed successfully after 5 iterations");
        return;
      }
    }

    console.log("Worker task stopped gracefully");
  }
}

// Expose the service for worker thread communication
expose(new WorkerFailureService());
