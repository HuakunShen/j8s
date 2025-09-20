import { Effect } from "effect";
import type { EffectHealthCheckResult, IEffectService } from "./interfaces";

/**
 * Abstract base class for Effect-based services.
 * Status management is handled by the EffectServiceManager.
 */
export abstract class BaseEffectService implements IEffectService {
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  public abstract start(): Effect.Effect<void, Error>;
  public abstract stop(): Effect.Effect<void, Error>;

  public healthCheck(): Effect.Effect<EffectHealthCheckResult, never> {
    // Return a minimal health check
    // The EffectServiceManager will add the correct status
    return Effect.succeed({
      status: "stopped", // This will be replaced by EffectServiceManager
      details: {},
    });
  }
}