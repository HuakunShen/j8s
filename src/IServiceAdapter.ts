import { Effect } from "effect";
import type { IService, HealthCheckResult } from "./interface";

/**
 * An internal adapter responsible for converting a class-based IService
 * into an Effect program that the ServiceManager can run.
 *
 * This hybrid approach uses traditional Promise-based service execution
 * while providing Effect-based APIs for service management.
 */
export class IServiceAdapter {
  readonly healthCheck: Effect.Effect<HealthCheckResult, Error>;
  private started = false;
  private startPromise: Promise<void> | null = null;

  constructor(public readonly service: IService) {
    this.healthCheck = Effect.tryPromise({
      try: () => this.service.healthCheck(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
  }

  /**
   * Start the service using traditional Promise-based approach
   * This maintains compatibility with existing service implementations
   */
  async start(): Promise<void> {
    // If already started and promise exists, return the existing promise
    if (this.started && this.startPromise) {
      console.log("returning existing startPromise (already started)");
      return this.startPromise;
    }

    // If there's a startPromise but not marked as started, it might be in progress or rejected
    // Create a new promise to allow restart after failure
    this.started = false; // Reset started flag
    this.startPromise = (async () => {
      try {
        await this.service.start();
        this.started = true;
        console.warn("service.start() completed successfully");
      } catch (error) {
        console.warn("service.start() failed:", error);
        // Clear state on failure to allow restart
        this.started = false;
        this.startPromise = null;
        throw error;
      }
    })();

    await this.startPromise;
  }

  /**
   * Stop the service gracefully
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    try {
      await this.service.stop();
    } catch (error) {
      console.error("Error during service stop:", error);
      // Always reset state even if stop fails
      this.started = false;
      this.startPromise = null;

      // For force-stop scenarios, we should be more lenient with certain errors
      // such as connection already closed errors
      if (
        error instanceof Error &&
        (error.message.includes("Connection closed") ||
          error.message.includes("IllegalOperationError"))
      ) {
        console.warn(
          "Ignoring connection error during service shutdown:",
          error.message
        );
        return; // Don't re-throw for connection errors during shutdown
      }

      throw error; // Re-throw other errors to allow ServiceManager to handle
    }

    this.started = false;
    this.startPromise = null;
  }

  /**
   * Check if the service is currently started
   */
  isStarted(): boolean {
    return this.started;
  }
}
