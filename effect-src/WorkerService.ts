import { Effect } from "effect";
import type {
  ServiceConfig,
  HealthCheckResult,
  AnyServiceError,
} from "./types";
import { EffectBaseService, ServiceErrors } from "./index";

/**
 * Effect-based Worker Service for managing worker threads with structured concurrency
 */
export class EffectWorkerService extends EffectBaseService {
  private worker: Worker | null = null;
  private workerURL: string | URL;
  private workerOptions?: WorkerOptions;
  private workerData?: any;
  private autoTerminate = false;
  private terminateTimeout: NodeJS.Timeout | null = null;

  constructor(
    name: string,
    options: {
      workerURL: string | URL;
      workerOptions?: WorkerOptions;
      workerData?: any;
      autoTerminate?: boolean;
    },
    config?: ServiceConfig
  ) {
    super(name, config);
    this.workerURL = options.workerURL;
    this.workerOptions = options.workerOptions;
    this.workerData = options.workerData;
    this.autoTerminate = options.autoTerminate || false;
  }

  protected doStart(): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      this.logWithContext("info", `Initializing worker for ${this.name}...`);

      // Clean up any existing worker
      this.cleanupSync();

      try {
        // Merge worker options with data
        const options: WorkerOptions = {
          ...(this.workerOptions || {}),
          ...(this.workerData !== undefined
            ? { workerData: this.workerData }
            : {}),
        };

        // Create new worker
        this.worker = new Worker(this.workerURL.toString(), options);

        // Set up event handlers
        this.setupWorkerEventHandlers();

        // Setup auto-terminate if enabled
        if (this.autoTerminate) {
          this.setupAutoTerminate();
        }

        this.logWithContext(
          "info",
          `Worker initialized successfully for ${this.name}`
        );
      } catch (error) {
        throw ServiceErrors.serviceError(
          `Failed to initialize worker for ${this.name}`,
          this.name,
          error
        );
      }
    });
  }

  protected doStop(): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      this.logWithContext("info", `Stopping worker for ${this.name}...`);

      if (this.terminateTimeout) {
        clearTimeout(this.terminateTimeout);
        this.terminateTimeout = null;
      }

      this.cleanupSync();

      this.logWithContext(
        "info",
        `Worker stopped successfully for ${this.name}`
      );
    });
  }

  protected doHealthCheck(): Effect.Effect<HealthCheckResult, AnyServiceError> {
    return Effect.sync(() => {
      const isHealthy = this.worker !== null && !this.worker.terminated;

      return {
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: Date.now(),
        details: {
          workerTerminated: this.worker?.terminated,
          autoTerminate: this.autoTerminate,
          workerURL: this.workerURL.toString(),
        },
      };
    });
  }

  /**
   * Send message to worker
   */
  public sendMessage(message: any): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      if (!this.worker || this.worker.terminated) {
        throw ServiceErrors.serviceError(
          "Cannot send message - worker is not running",
          this.name
        );
      }

      this.worker.postMessage(message);
      this.logWithContext("debug", `Message sent to worker ${this.name}`, {
        messageType: typeof message,
      });
    });
  }

  /**
   * Execute RPC call on worker
   */
  public callRPC<T>(
    method: string,
    params?: any
  ): Effect.Effect<T, AnyServiceError> {
    return Effect.async((resume) => {
      if (!this.worker || this.worker.terminated) {
        resume(
          Effect.fail(
            ServiceErrors.serviceError(
              "Cannot call RPC - worker is not running",
              this.name
            )
          )
        );
        return;
      }

      const requestId = Math.random().toString(36).substr(2, 9);

      const timeout = setTimeout(() => {
        cleanup();
        resume(
          Effect.fail(
            ServiceErrors.serviceError(
              `RPC call timeout for method: ${method}`,
              this.name
            )
          )
        );
      }, 30000); // 30 second timeout

      const messageHandler = (event: MessageEvent) => {
        if (
          event.data?.type === "rpc-response" &&
          event.data?.requestId === requestId
        ) {
          cleanup();
          if (event.data.error) {
            resume(
              Effect.fail(
                ServiceErrors.serviceError(
                  `RPC call failed: ${event.data.error}`,
                  this.name
                )
              )
            );
          } else {
            resume(Effect.succeed(event.data.result));
          }
        }
      };

      const errorHandler = (error: ErrorEvent) => {
        cleanup();
        resume(
          Effect.fail(
            ServiceErrors.serviceError(
              `Worker error during RPC call: ${error.message}`,
              this.name,
              error
            )
          )
        );
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.worker?.removeEventListener("message", messageHandler);
        this.worker?.removeEventListener("error", errorHandler);
      };

      this.worker?.addEventListener("message", messageHandler);
      this.worker?.addEventListener("error", errorHandler);

      // Send RPC request
      this.worker?.postMessage({
        type: "rpc-request",
        requestId,
        method,
        params,
      });
    });
  }

  /**
   * Get worker statistics
   */
  public getStats(): Effect.Effect<
    {
      uptime: number;
      messageCount: number;
    },
    AnyServiceError
  > {
    return Effect.sync(() => {
      if (!this.worker || this.worker.terminated) {
        return {
          uptime: 0,
          messageCount: 0,
        };
      }

      // In a real implementation, you'd collect actual worker stats
      // For now, return basic information
      return {
        uptime: Date.now() - (this.worker as any).startTime,
        messageCount: 0, // Would track actual messages
      };
    });
  }

  /**
   * Restart worker
   */
  public restartWorker(): Effect.Effect<void, AnyServiceError> {
    return this.doStop().pipe(
      Effect.flatMap(() => Effect.sleep(1000)),
      Effect.flatMap(() => this.doStart())
    );
  }

  /**
   * Set worker timeout
   */
  public setTimeout(timeoutMs: number): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      if (this.terminateTimeout) {
        clearTimeout(this.terminateTimeout);
      }

      this.terminateTimeout = setTimeout(() => {
        this.stop()
          .pipe(Effect.runPromise)
          .catch((error) => {
            console.error(`Error auto-terminating worker ${this.name}:`, error);
          });
      }, timeoutMs);
    });
  }

  /**
   * Clear worker timeout
   */
  public clearTimeout(): Effect.Effect<void, AnyServiceError> {
    return Effect.sync(() => {
      if (this.terminateTimeout) {
        clearTimeout(this.terminateTimeout);
        this.terminateTimeout = null;
      }
    });
  }

  private setupWorkerEventHandlers(): void {
    if (!this.worker) return;

    this.worker.addEventListener("error", (event) => {
      this.logWithContext("error", `Worker error for ${this.name}`, {
        error: event.message,
      });
    });

    this.worker.addEventListener("messageerror", (event) => {
      this.logWithContext("error", `Worker message error for ${this.name}`);
    });

    this.worker.addEventListener("exit", (event) => {
      this.logWithContext("info", `Worker exited for ${this.name}`, {
        code: event.exitCode,
      });
      this.worker = null;
    });
  }

  private setupAutoTerminate(): void {
    if (this.autoTerminate && this.worker) {
      this.setTimeout(5000); // Auto-terminate after 5 seconds
    }
  }

  private cleanupSync(): void {
    if (this.terminateTimeout) {
      clearTimeout(this.terminateTimeout);
      this.terminateTimeout = null;
    }

    if (this.worker) {
      try {
        // Remove event listeners
        this.worker.removeAllListeners();

        // Terminate worker if not already terminated
        if (!this.worker.terminated) {
          this.worker.terminate();
        }

        this.logWithContext("debug", `Worker cleaned up for ${this.name}`);
      } catch (error) {
        this.logWithContext(
          "error",
          `Error cleaning up worker for ${this.name}`,
          { error }
        );
      } finally {
        this.worker = null;
      }
    }
  }
}

/**
 * Factory for creating worker services
 */
export class WorkerServiceFactory {
  /**
   * Create a worker service from a worker file
   */
  static create(
    name: string,
    workerPath: string,
    options: {
      workerOptions?: WorkerOptions;
      workerData?: any;
      autoTerminate?: boolean;
    } = {},
    config?: ServiceConfig
  ): EffectWorkerService {
    const workerURL = new URL(workerPath, import.meta.url);
    return new EffectWorkerService(name, { workerURL, ...options }, config);
  }

  /**
   * Create a worker service with RPC capabilities
   */
  static createRPC(
    name: string,
    workerPath: string,
    options: {
      workerOptions?: WorkerOptions;
      workerData?: any;
      autoTerminate?: boolean;
      rpcTimeout?: number;
    } = {},
    config?: ServiceConfig
  ): EffectWorkerService {
    const service = this.create(name, workerPath, options, config);

    // Configure RPC timeout if provided
    if (options.rpcTimeout) {
      service
        .setTimeout(options.rpcTimeout)
        .pipe(Effect.runPromise)
        .catch(() => {
          // Timeout errors are logged automatically
        });
    }

    return service;
  }
}
