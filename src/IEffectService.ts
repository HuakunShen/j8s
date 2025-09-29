import { Effect } from "effect";
import type { HealthCheckResult } from "./interface";

/**
 * Effect-based service interface for advanced users who want to leverage
 * Effect's full capabilities without the adapter pattern overhead
 */
export interface IEffectService {
  readonly name: string;
  
  /**
   * Start the service as an Effect
   */
  startEffect(): Effect.Effect<void, Error>;
  
  /**
   * Stop the service as an Effect
   */
  stopEffect(): Effect.Effect<void, Error>;
  
  /**
   * Health check as an Effect
   */
  healthCheckEffect(): Effect.Effect<HealthCheckResult, Error>;
  
  /**
   * Optional: Restart the service as an Effect
   */
  restartEffect?(): Effect.Effect<void, Error>;
}

/**
 * Base class for Effect-based services
 */
export abstract class BaseEffectService implements IEffectService {
  public abstract readonly name: string;
  
  public abstract startEffect(): Effect.Effect<void, Error>;
  public abstract stopEffect(): Effect.Effect<void, Error>;
  public abstract healthCheckEffect(): Effect.Effect<HealthCheckResult, Error>;
  
  public restartEffect(): Effect.Effect<void, Error> {
    const self = this;
    return Effect.gen(function* () {
      yield* Effect.logInfo(`Restarting service ${self.name}`);
      yield* self.stopEffect();
      yield* self.startEffect();
    });
  }
}

/**
 * Example Effect-based database service
 */
export class DatabaseEffectService extends BaseEffectService {
  readonly name = "database-effect-service";
  private isConnected = false;

  startEffect(): Effect.Effect<void, Error> {
    return Effect.gen(function* (this: DatabaseEffectService) {
      yield* Effect.logInfo("Connecting to database...");
      // Simulate connection setup
      yield* Effect.sleep(1000);
      this.isConnected = true;
      yield* Effect.logInfo("Database connected successfully");
    });
  }

  stopEffect(): Effect.Effect<void, Error> {
    return Effect.gen(function* (this: DatabaseEffectService) {
      yield* Effect.logInfo("Disconnecting from database...");
      // Simulate cleanup
      yield* Effect.sleep(500);
      this.isConnected = false;
      yield* Effect.logInfo("Database disconnected successfully");
    });
  }

  healthCheckEffect(): Effect.Effect<HealthCheckResult, Error> {
    return Effect.succeed({
      status: this.isConnected ? "running" : "stopped",
      details: {
        connected: this.isConnected,
        timestamp: new Date().toISOString(),
      },
    });
  }
}