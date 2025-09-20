import { Effect, Runtime } from "effect";
import { Worker } from "worker_threads";
import type { EffectHealthCheckResult, IEffectService } from "./interfaces";

export interface EffectWorkerServiceOptions {
  workerURL: string | URL;
  workerData?: any;
  workerOptions?: ConstructorParameters<typeof Worker>[1];
  autoTerminate?: boolean;
}

export class EffectWorkerService implements IEffectService {
  public name: string;
  private options: EffectWorkerServiceOptions;
  private worker?: Worker;
  private runtime = Runtime.defaultRuntime;

  constructor(name: string, options: EffectWorkerServiceOptions) {
    this.name = name;
    this.options = options;
  }

  public start(): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      if (this.worker) {
        yield* Effect.fail(new Error(`Worker service '${this.name}' is already running`));
      }

      const workerURL = typeof this.options.workerURL === "string"
        ? this.options.workerURL
        : this.options.workerURL.toString();

      this.worker = new Worker(workerURL, {
        ...this.options.workerOptions,
        workerData: this.options.workerData,
      });

      // Set up worker event handlers
      const setupWorker = Effect.gen(this, function* () {
        if (!this.worker) return;

        return yield* Effect.async<void, Error>((resume) => {
          if (!this.worker) {
            resume(Effect.fail(new Error("Worker not initialized")));
            return;
          }

          this.worker.on("error", (error) => {
            console.error(`Worker service '${this.name}' error:`, error);
            resume(Effect.fail(error));
          });

          this.worker.on("exit", (code) => {
            if (code !== 0) {
              console.error(`Worker service '${this.name}' exited with code ${code}`);
              resume(Effect.fail(new Error(`Worker exited with code ${code}`)));
            } else {
              console.log(`Worker service '${this.name}' exited successfully`);
              resume(Effect.succeed(undefined));
            }
          });

          this.worker.on("online", () => {
            console.log(`Worker service '${this.name}' is online`);

            if (this.options.autoTerminate) {
              // Auto-terminate after a short delay to allow initialization
              setTimeout(() => {
                if (this.worker) {
                  this.worker.terminate();
                }
              }, 100);
            }

            resume(Effect.succeed(undefined));
          });
        });
      });

      yield* setupWorker;
    });
  }

  public stop(): Effect.Effect<void, Error> {
    return Effect.gen(this, function* () {
      if (!this.worker) {
        return;
      }

      const terminateWorker = Effect.async<void, Error>((resume) => {
        if (!this.worker) {
          resume(Effect.succeed(undefined));
          return;
        }

        const worker = this.worker;
        this.worker = undefined;

        // Set a timeout for worker termination
        const timeout = setTimeout(() => {
          console.warn(`Worker service '${this.name}' termination timeout, force killing`);
          worker.terminate().then(() => {
            resume(Effect.succeed(undefined));
          });
        }, 5000);

        worker.terminate().then(() => {
          clearTimeout(timeout);
          console.log(`Worker service '${this.name}' terminated successfully`);
          resume(Effect.succeed(undefined));
        }).catch((error) => {
          clearTimeout(timeout);
          console.error(`Error terminating worker service '${this.name}':`, error);
          resume(Effect.succeed(undefined)); // Still consider it stopped
        });
      });

      yield* terminateWorker;
    });
  }

  public healthCheck(): Effect.Effect<EffectHealthCheckResult, never> {
    return Effect.succeed({
      status: this.worker ? "running" : "stopped",
      details: {
        workerId: this.worker?.threadId,
        workerURL: this.options.workerURL.toString(),
      },
    });
  }
}

/**
 * Creates a new Effect-based worker service.
 * @param name - The name of the service.
 * @param workerPath - The path to the worker file.
 * @param options - The options for the worker service.
 * @returns A new Effect-based worker service that can be added to the EffectServiceManager.
 */
export function createEffectWorkerService(
  name: string,
  workerPath: string | URL,
  options?: Partial<EffectWorkerServiceOptions>
): EffectWorkerService {
  const fullOptions: EffectWorkerServiceOptions = {
    workerURL: workerPath,
    workerOptions: {},
    autoTerminate: false,
    ...options,
  };

  return new EffectWorkerService(name, fullOptions);
}