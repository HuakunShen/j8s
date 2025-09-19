import { Effect } from "effect";
import type { LoggingService, AnyServiceError } from "./types";

/**
 * Simple console-based logging service implementation
 */
export class ConsoleLoggingService implements LoggingService {
  private readonly serviceName: string;

  constructor(serviceName?: string) {
    this.serviceName = serviceName || "j8s";
  }

  info(message: string, metadata?: Record<string, unknown>): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log(`[${this.serviceName}] INFO: ${message}`, metadata || "");
    });
  }

  warn(message: string, metadata?: Record<string, unknown>): Effect.Effect<void> {
    return Effect.sync(() => {
      console.warn(`[${this.serviceName}] WARN: ${message}`, metadata || "");
    });
  }

  error(message: string, error?: unknown, metadata?: Record<string, unknown>): Effect.Effect<void> {
    return Effect.sync(() => {
      console.error(`[${this.serviceName}] ERROR: ${message}`, {
        ...(metadata || {}),
        ...(error ? { error: error instanceof Error ? error.message : String(error) } : {})
      });
    });
  }

  debug(message: string, metadata?: Record<string, unknown>): Effect.Effect<void> {
    return Effect.sync(() => {
      console.debug(`[${this.serviceName}] DEBUG: ${message}`, metadata || "");
    });
  }
}

/**
 * Structured logging utility
 */
export class StructuredLogger {
  static withContext(
    logger: LoggingService,
    context: Record<string, unknown>
  ): LoggingService {
    return {
      info: (message: string, metadata?: Record<string, unknown>) =>
        logger.info(message, { ...context, ...metadata }),
      warn: (message: string, metadata?: Record<string, unknown>) =>
        logger.warn(message, { ...context, ...metadata }),
      error: (message: string, error?: unknown, metadata?: Record<string, unknown>) =>
        logger.error(message, error, { ...context, ...metadata }),
      debug: (message: string, metadata?: Record<string, unknown>) =>
        logger.debug(message, { ...context, ...metadata })
    };
  }

  static withServiceName(logger: LoggingService, serviceName: string): LoggingService {
    return this.withContext(logger, { service: serviceName });
  }
}
