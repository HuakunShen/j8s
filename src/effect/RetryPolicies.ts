import { Effect, Schedule, Duration, Random } from "effect";
import type { RetryPolicy } from "./interfaces";
import type { AllServiceErrors } from "./errors";

/**
 * Advanced retry policy configuration with Effect-specific enhancements
 */
export interface AdvancedRetryPolicy extends RetryPolicy {
  readonly jitter?: {
    readonly enabled: boolean;
    readonly maxFactor?: number; // Default 0.1 (10% jitter)
  };
  readonly backoffCap?: number; // Maximum delay cap in milliseconds
  readonly resetAfter?: number; // Reset retry count after this duration of success
  readonly errorClassifier?: (error: unknown) => "retry" | "abort" | "escalate";
  readonly onRetry?: (attempt: number, error: unknown, delay: number) => Effect.Effect<void, never, never>;
  readonly onAbort?: (attempt: number, error: unknown) => Effect.Effect<void, never, never>;
}

/**
 * Retry policy builder for creating sophisticated retry strategies
 */
export class RetryPolicyBuilder {
  private config: AdvancedRetryPolicy;

  constructor(type: RetryPolicy["type"]) {
    this.config = {
      type,
      maxRetries: 3,
      baseDelay: 1000,
      factor: 2
    };
  }

  /**
   * Set maximum number of retry attempts
   */
  maxRetries(count: number): RetryPolicyBuilder {
    this.config = { ...this.config, maxRetries: count };
    return this;
  }

  /**
   * Set maximum total duration for all retry attempts
   */
  maxDuration(duration: number): RetryPolicyBuilder {
    this.config = { ...this.config, maxDuration: duration };
    return this;
  }

  /**
   * Set base delay between retries
   */
  baseDelay(delay: number): RetryPolicyBuilder {
    this.config = { ...this.config, baseDelay: delay };
    return this;
  }

  /**
   * Set factor for exponential backoff
   */
  factor(factor: number): RetryPolicyBuilder {
    this.config = { ...this.config, factor };
    return this;
  }

  /**
   * Enable jitter to prevent thundering herd
   */
  withJitter(maxFactor: number = 0.1): RetryPolicyBuilder {
    this.config = { 
      ...this.config, 
      jitter: { enabled: true, maxFactor } 
    };
    return this;
  }

  /**
   * Set maximum delay cap
   */
  maxDelay(cap: number): RetryPolicyBuilder {
    this.config = { ...this.config, backoffCap: cap };
    return this;
  }

  /**
   * Set retry count reset duration
   */
  resetAfter(duration: number): RetryPolicyBuilder {
    this.config = { ...this.config, resetAfter: duration };
    return this;
  }

  /**
   * Set error classifier for conditional retries
   */
  classify(classifier: (error: unknown) => "retry" | "abort" | "escalate"): RetryPolicyBuilder {
    this.config = { ...this.config, errorClassifier: classifier };
    return this;
  }

  /**
   * Set retry callback
   */
  onRetry(callback: (attempt: number, error: unknown, delay: number) => Effect.Effect<void, never, never>): RetryPolicyBuilder {
    this.config = { ...this.config, onRetry: callback };
    return this;
  }

  /**
   * Set abort callback
   */
  onAbort(callback: (attempt: number, error: unknown) => Effect.Effect<void, never, never>): RetryPolicyBuilder {
    this.config = { ...this.config, onAbort: callback };
    return this;
  }

  /**
   * Build the final retry policy
   */
  build(): AdvancedRetryPolicy {
    return { ...this.config };
  }
}

/**
 * Schedule factory for creating Effect schedules from retry policies
 */
export class ScheduleFactory {
  /**
   * Create a Schedule from a retry policy configuration
   */
  static fromRetryPolicy(policy: AdvancedRetryPolicy): Schedule.Schedule<any, unknown, any> {
    let schedule = ScheduleFactory.createBaseSchedule(policy);
    
    // Apply jitter if enabled
    if (policy.jitter?.enabled) {
      schedule = ScheduleFactory.applyJitter(schedule, policy.jitter.maxFactor ?? 0.1);
    }

    // Apply backoff cap if specified
    if (policy.backoffCap) {
      schedule = ScheduleFactory.applyBackoffCap(schedule, policy.backoffCap);
    }

    // Apply max retries limit
    if (policy.maxRetries) {
      schedule = Schedule.compose(schedule, Schedule.recurs(policy.maxRetries));
    }

    // Apply max duration limit
    if (policy.maxDuration) {
      schedule = Schedule.compose(schedule, Schedule.upTo(policy.maxDuration));
    }

    // Apply error classification if provided
    if (policy.errorClassifier) {
      schedule = ScheduleFactory.applyErrorClassification(schedule, policy.errorClassifier);
    }

    return schedule;
  }

  /**
   * Create base schedule based on policy type
   */
  private static createBaseSchedule(policy: AdvancedRetryPolicy): Schedule.Schedule<any, unknown, any> {
    const baseDelay = policy.baseDelay ?? 1000;
    const factor = policy.factor ?? 2;

    switch (policy.type) {
      case "linear":
        return Schedule.fixed(baseDelay);
      
      case "exponential":
        return Schedule.exponential(baseDelay, factor);
      
      case "fibonacci":
        return Schedule.fibonacci(baseDelay);
      
      case "spaced":
        return Schedule.spaced(baseDelay);
      
      case "jittered":
        return Schedule.jittered(Schedule.exponential(baseDelay, factor));
      
      default:
        return Schedule.exponential(baseDelay, factor);
    }
  }

  /**
   * Apply jitter to a schedule
   */
  private static applyJitter(
    schedule: Schedule.Schedule<any, unknown, any>, 
    maxFactor: number
  ): Schedule.Schedule<any, unknown, any> {
    return Schedule.jittered(schedule, { min: 0, max: maxFactor });
  }

  /**
   * Apply backoff cap to a schedule
   */
  private static applyBackoffCap(
    schedule: Schedule.Schedule<any, unknown, any>,
    cap: number
  ): Schedule.Schedule<any, unknown, any> {
    return Schedule.intersect(schedule, Schedule.fixed(cap));
  }

  /**
   * Apply error classification to a schedule
   */
  private static applyErrorClassification(
    schedule: Schedule.Schedule<any, unknown, any>,
    classifier: (error: unknown) => "retry" | "abort" | "escalate"
  ): Schedule.Schedule<any, unknown, any> {
    return Schedule.whileInput(schedule, (error: unknown) => {
      const decision = classifier(error);
      return decision === "retry";
    });
  }
}

/**
 * Pre-built retry policies for common scenarios
 */
export class CommonRetryPolicies {
  /**
   * Quick retry for transient network issues
   */
  static readonly quickRetry = new RetryPolicyBuilder("exponential")
    .maxRetries(3)
    .baseDelay(500)
    .factor(1.5)
    .maxDelay(2000)
    .withJitter()
    .build();

  /**
   * Standard retry for most service operations
   */
  static readonly standard = new RetryPolicyBuilder("exponential")
    .maxRetries(5)
    .baseDelay(1000)
    .factor(2)
    .maxDelay(30000)
    .maxDuration(120000) // 2 minutes total
    .withJitter()
    .build();

  /**
   * Aggressive retry for critical operations
   */
  static readonly aggressive = new RetryPolicyBuilder("exponential")
    .maxRetries(10)
    .baseDelay(500)
    .factor(1.8)
    .maxDelay(60000)
    .maxDuration(300000) // 5 minutes total
    .withJitter()
    .build();

  /**
   * Conservative retry for expensive operations
   */
  static readonly conservative = new RetryPolicyBuilder("linear")
    .maxRetries(3)
    .baseDelay(5000)
    .maxDuration(60000) // 1 minute total
    .build();

  /**
   * Database retry with specific error classification
   */
  static readonly database = new RetryPolicyBuilder("exponential")
    .maxRetries(4)
    .baseDelay(1000)
    .factor(2)
    .maxDelay(10000)
    .withJitter()
    .classify((error) => {
      const errorMessage = String(error).toLowerCase();
      
      // Retry on connection issues
      if (errorMessage.includes("connection") || 
          errorMessage.includes("timeout") ||
          errorMessage.includes("deadlock")) {
        return "retry";
      }
      
      // Don't retry on syntax or authentication errors
      if (errorMessage.includes("syntax") ||
          errorMessage.includes("auth") ||
          errorMessage.includes("permission")) {
        return "abort";
      }
      
      return "retry";
    })
    .build();

  /**
   * API retry with HTTP status code classification
   */
  static readonly api = new RetryPolicyBuilder("exponential")
    .maxRetries(4)
    .baseDelay(1000)
    .factor(2)
    .maxDelay(15000)
    .withJitter()
    .classify((error) => {
      // Extract HTTP status code if available
      const statusCode = ScheduleFactory.extractStatusCode(error);
      
      if (!statusCode) return "retry";
      
      // Retry on 5xx errors and 429 (rate limit)
      if (statusCode >= 500 || statusCode === 429) {
        return "retry";
      }
      
      // Don't retry on 4xx client errors (except 429)
      if (statusCode >= 400 && statusCode < 500) {
        return "abort";
      }
      
      return "retry";
    })
    .build();

  /**
   * Worker retry for worker thread communication
   */
  static readonly worker = new RetryPolicyBuilder("fibonacci")
    .maxRetries(6)
    .baseDelay(800)
    .maxDelay(20000)
    .withJitter()
    .classify((error) => {
      const errorMessage = String(error).toLowerCase();
      
      // Retry on communication failures
      if (errorMessage.includes("communication") ||
          errorMessage.includes("worker") ||
          errorMessage.includes("rpc")) {
        return "retry";
      }
      
      return "abort";
    })
    .build();
}

/**
 * Utility functions for schedule factory
 */
export class ScheduleUtils {
  /**
   * Extract HTTP status code from error
   */
  static extractStatusCode(error: unknown): number | null {
    if (typeof error === "object" && error !== null) {
      // Check common error object patterns
      if ("status" in error && typeof error.status === "number") {
        return error.status;
      }
      if ("statusCode" in error && typeof error.statusCode === "number") {
        return error.statusCode;
      }
      if ("code" in error && typeof error.code === "number") {
        return error.code;
      }
    }
    
    return null;
  }

  /**
   * Create a logging retry policy for debugging
   */
  static withLogging<A, E, R>(
    effect: Effect.Effect<A, E, R>,
    policy: AdvancedRetryPolicy,
    serviceName: string
  ): Effect.Effect<A, E, R> {
    const schedule = ScheduleFactory.fromRetryPolicy({
      ...policy,
      onRetry: (attempt, error, delay) =>
        Effect.log(`[${serviceName}] Retry attempt ${attempt} after ${delay}ms delay. Error: ${String(error)}`),
      onAbort: (attempt, error) =>
        Effect.log(`[${serviceName}] Retry aborted after ${attempt} attempts. Final error: ${String(error)}`)
    });

    return Effect.retry(effect, schedule);
  }

  /**
   * Create a metrics-enabled retry policy
   */
  static withMetrics<A, E, R>(
    effect: Effect.Effect<A, E, R>,
    policy: AdvancedRetryPolicy,
    serviceName: string,
    metricsCollector?: (metric: string, tags: Record<string, string>) => Effect.Effect<void, never, never>
  ): Effect.Effect<A, E, R> {
    if (!metricsCollector) {
      return Effect.retry(effect, ScheduleFactory.fromRetryPolicy(policy));
    }

    const enhancedPolicy: AdvancedRetryPolicy = {
      ...policy,
      onRetry: (attempt, error, delay) =>
        Effect.gen(function* () {
          yield* metricsCollector("service.retry.attempt", {
            service: serviceName,
            attempt: String(attempt),
            error: String(error)
          });
          
          if (policy.onRetry) {
            yield* policy.onRetry(attempt, error, delay);
          }
        }),
      onAbort: (attempt, error) =>
        Effect.gen(function* () {
          yield* metricsCollector("service.retry.abort", {
            service: serviceName,
            attempts: String(attempt),
            error: String(error)
          });
          
          if (policy.onAbort) {
            yield* policy.onAbort(attempt, error);
          }
        })
    };

    return Effect.retry(effect, ScheduleFactory.fromRetryPolicy(enhancedPolicy));
  }
}

// Re-export the static method for convenience
ScheduleFactory.extractStatusCode = ScheduleUtils.extractStatusCode;