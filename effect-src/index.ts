// Core types and interfaces
export type {
  ServiceStatus,
  AnyServiceError,
  HealthCheckResult,
  IEffectService,
  RetryConfig,
  ServiceConfig,
  CronJobConfig,
  ServiceContext,
  LoggingService,
  TracingService,
  Span,
  ResourceManager,
  HealthChecker
} from "./types";

export {
  DEFAULT_RETRY_CONFIG,
  ServiceContext
} from "./types";

// Import error classes to use in utilities
import { 
  ServiceError,
  ResourceError,
  RetryLimitExceededError 
} from "./types";

// Also export them
export { 
  ServiceError,
  ResourceError,
  RetryLimitExceededError 
} from "./types";

// Retry and scheduling
export {
  createRetrySchedule,
  createRateLimitSchedule,
  createRetryWithRateLimitSchedule,
  retryWithConfig,
  retryExponential
} from "./retry";

// Logging
export {
  ConsoleLoggingService,
  StructuredLogger
} from "./logging";

// Error utilities
export class ServiceErrors {
  static serviceError(
    message: string,
    serviceName: string,
    cause?: unknown
  ): ServiceError {
    return new ServiceError(message, serviceName, cause);
  }

  static resourceError(
    message: string,
    resourceName: string,
    cause?: unknown
  ): ResourceError {
    return new ResourceError(message, resourceName, cause);
  }

  static retryLimitExceeded(
    message: string,
    serviceName: string,
    attempt: number
  ): RetryLimitExceededError {
    return new RetryLimitExceededError(message, serviceName, attempt);
  }
}

// Configuration utilities
export class ConfigUtils {
  static mergeRetryConfig(
    base: RetryConfig,
    override: Partial<RetryConfig>
  ): RetryConfig {
    return {
      ...base,
      ...override,
      rateLimit: {
        ...base.rateLimit,
        ...override.rateLimit
      }
    };
  }

  static validateRetryConfig(config: RetryConfig): boolean {
    if (config.maxRetries !== undefined && config.maxRetries < 0) {
      return false;
    }
    if (config.baseDelay !== undefined && config.baseDelay < 0) {
      return false;
    }
    if (config.maxDelay !== undefined && config.maxDelay < 0) {
      return false;
    }
    if (config.rateLimit) {
      if (config.rateLimit.maxAttempts <= 0 || config.rateLimit.window <= 0) {
        return false;
      }
    }
    return true;
  }
}
