import { Duration, Effect } from "effect";
import { BaseService, ServiceManager, type HealthCheckResult } from "j8s";

// Create a service that runs in the main thread as a long-running task
class MyService extends BaseService {
  private isStopped = false;

  protected onStart() {
    return Effect.gen(this, function* () {
      console.log("Service started - iteration count reset");
      this.isStopped = false;
      yield* this.runLongRunningTask();
      console.log("Long-running task completed");
    });
  }

  protected onStop() {
    return Effect.sync(() => {
      console.log("Service stopping");
      this.isStopped = true;
    });
  }

  protected override onHealthCheck() {
    return Effect.succeed<HealthCheckResult>({
      status: "running",
      details: {
        isRunning: !this.isStopped,
      },
    });
  }

  private runLongRunningTask(): Effect.Effect<void, unknown> {
    const self = this;
    return Effect.gen(function* () {
      let count = 0;
      while (!self.isStopped) {
        yield* Effect.sleep(Duration.seconds(1));
        count++;
        console.log(`Running iteration ${count}`);
        const random = Math.random();
        console.log(`Random number: ${random}`);
        if (random < 0.4) {
          yield* Effect.fail(
            new Error(`Random failure at iteration ${count}`)
          );
        }

        if (count >= 10) {
          console.log("Task completed successfully after 10 iterations");
          return;
        }
      }

      console.log("Task stopped gracefully");
    });
  }
}

// Create a service manager
const manager = new ServiceManager();

// Add the service
const myService = new MyService("my-service");
manager.addService(myService, {
  // restartPolicy: "always", // Will restart on any failure
  restartPolicy: "on-failure",
  maxRetries: 3,
});

// Start the service
await Effect.runPromise(manager.startAllServices());

// Keep the process running to observe background failures and restarts
console.log("Service manager is running. Press Ctrl+C to exit.");
