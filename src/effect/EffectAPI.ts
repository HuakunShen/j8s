import { Effect, Layer, Context, Stream, Schedule, pipe } from "effect";
import { Hono } from "hono";
import type { Context as HonoContext } from "hono";
import { describeRoute, openAPISpecs } from "hono-openapi";
import * as v from "valibot";
import { resolver, validator as vValidator } from "hono-openapi/valibot";
import { Scalar } from "@scalar/hono-api-reference";
import type { EffectServiceManager, ServiceContext, ServiceLifecycleEvent } from "./interfaces";
import type { HealthCheckResult } from "../interface";
import { 
  AllAPIErrors, 
  ValidationError, 
  NotFoundError, 
  ConflictError, 
  InternalError,
  AllServiceErrors 
} from "./errors";
import type { ObservabilityManager } from "./interfaces";

// Enhanced validation schemas with Effect types
const ServiceNameSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100))
}, "ServiceNameSchema");

const ServiceConfigSchema = v.object({
  restartPolicy: v.optional(v.union([
    v.literal("always"),
    v.literal("unless-stopped"), 
    v.literal("on-failure"),
    v.literal("no")
  ])),
  retryPolicy: v.optional(v.object({
    type: v.union([
      v.literal("linear"),
      v.literal("exponential"),
      v.literal("fibonacci"),
      v.literal("spaced"),
      v.literal("jittered")
    ]),
    maxRetries: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    maxDuration: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1000))),
    baseDelay: v.optional(v.pipe(v.number(), v.integer(), v.minValue(100))),
    factor: v.optional(v.pipe(v.number(), v.minValue(1)))
  })),
  cronJob: v.optional(v.object({
    schedule: v.string(),
    timeout: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1000))),
    timezone: v.optional(v.string())
  })),
  timeout: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1000))),
  observability: v.optional(v.object({
    enableTracing: v.optional(v.boolean()),
    enableMetrics: v.optional(v.boolean()),
    tags: v.optional(v.record(v.string(), v.string()))
  }))
}, "ServiceConfigSchema");

const ServiceResponseSchema = v.object({
  name: v.string(),
  status: v.string(),
  health: v.object({
    status: v.string(),
    details: v.optional(v.record(v.string(), v.any())),
    lastHealthCheck: v.optional(v.string()),
    restartCount: v.optional(v.number()),
    uptime: v.optional(v.number()),
    metrics: v.optional(v.object({
      startupTime: v.optional(v.number()),
      errorCount: v.optional(v.number()),
      successCount: v.optional(v.number())
    }))
  })
}, "ServiceResponseSchema");

const ServicesListResponseSchema = v.object({
  services: v.array(v.object({
    name: v.string(),
    status: v.string(),
    config: ServiceConfigSchema
  }))
}, "ServicesListResponseSchema");

const ErrorResponseSchema = v.object({
  error: v.object({
    type: v.string(),
    message: v.string(),
    details: v.optional(v.record(v.string(), v.any()))
  })
}, "ErrorResponseSchema");

const MessageResponseSchema = v.object({
  message: v.string(),
  timestamp: v.string()
}, "MessageResponseSchema");

const MetricsResponseSchema = v.object({
  counters: v.record(v.string(), v.number()),
  gauges: v.record(v.string(), v.number()),
  histograms: v.record(v.string(), v.array(v.number())),
  timestamp: v.string()
}, "MetricsResponseSchema");

const EventStreamSchema = v.object({
  id: v.string(),
  event: v.string(),
  data: v.object({
    type: v.string(),
    serviceName: v.string(),
    timestamp: v.string(),
    payload: v.optional(v.any())
  })
}, "EventStreamSchema");

/**
 * Enhanced API configuration with Effect-specific options
 */
export interface EffectAPIConfig {
  readonly openapi?: {
    readonly enabled?: boolean;
    readonly info?: {
      readonly title?: string;
      readonly version?: string;
      readonly description?: string;
    };
    readonly servers?: ReadonlyArray<{
      readonly url: string;
      readonly description?: string;
    }>;
  };
  readonly scalar?: {
    readonly enabled?: boolean;
    readonly theme?: string;
  };
  readonly streaming?: {
    readonly enabled?: boolean;
    readonly bufferSize?: number;
    readonly keepAliveInterval?: number;
  };
  readonly cors?: {
    readonly enabled?: boolean;
    readonly origins?: ReadonlyArray<string>;
  };
  readonly rateLimit?: {
    readonly enabled?: boolean;
    readonly requestsPerMinute?: number;
  };
}

/**
 * Effect-based API request context
 */
export interface EffectAPIContext {
  readonly serviceManager: EffectServiceManager;
  readonly observabilityManager: ObservabilityManager;
  readonly eventStream: Stream.Stream<ServiceLifecycleEvent, never, never>;
}

export const EffectAPIContext = Context.GenericTag<EffectAPIContext>("@j8s/EffectAPIContext");

/**
 * Error handler that converts Effect errors to HTTP responses
 */
const handleEffectError = (error: AllServiceErrors | AllAPIErrors) => {
  switch (error._tag) {
    case "ValidationError":
      return {
        status: 400,
        body: {
          error: {
            type: "ValidationError",
            message: error.message,
            details: { field: error.field, expected: error.expected }
          }
        }
      };
    
    case "NotFoundError":
      return {
        status: 404,
        body: {
          error: {
            type: "NotFoundError",
            message: error.message,
            details: { resource: error.resource }
          }
        }
      };
    
    case "ConflictError":
      return {
        status: 409,
        body: {
          error: {
            type: "ConflictError",
            message: error.message,
            details: { reason: error.reason }
          }
        }
      };
    
    case "StartupError":
    case "ShutdownError":
    case "HealthCheckError":
    case "WorkerError":
    case "ScheduleError":
    case "ServiceError":
      return {
        status: 500,
        body: {
          error: {
            type: error._tag,
            message: error.message,
            details: { cause: String(error.cause) }
          }
        }
      };
    
    default:
      return {
        status: 500,
        body: {
          error: {
            type: "InternalError",
            message: "An internal error occurred",
            details: {}
          }
        }
      };
  }
};

/**
 * Effect wrapper for Hono handlers
 */
const effectHandler = <T>(
  effectFn: (c: HonoContext) => Effect.Effect<T, AllServiceErrors | AllAPIErrors, EffectAPIContext>
) => {
  return async (c: HonoContext) => {
    const apiContext = c.get("effectAPIContext") as EffectAPIContext;
    
    return Effect.runPromise(
      effectFn(c).pipe(
        Effect.provide(apiContext),
        Effect.mapError(handleEffectError),
        Effect.match({
          onFailure: (errorResponse) => c.json(errorResponse.body, errorResponse.status),
          onSuccess: (result) => c.json(result)
        })
      )
    );
  };
};

/**
 * Create Effect-based service manager API
 */
export const createEffectServiceManagerAPI = (
  serviceManager: EffectServiceManager,
  observabilityManager: ObservabilityManager,
  config?: EffectAPIConfig
): Effect.Effect<Hono, never, ServiceContext> =>
  Effect.gen(function* () {
    const app = new Hono();
    
    // Create event stream for real-time updates
    const eventStream = yield* Stream.make<ServiceLifecycleEvent>();
    
    // Set up API context middleware
    app.use("*", async (c, next) => {
      const apiContext: EffectAPIContext = {
        serviceManager,
        observabilityManager,
        eventStream
      };
      c.set("effectAPIContext", apiContext);
      await next();
    });

    // Add CORS if enabled
    if (config?.cors?.enabled) {
      // CORS middleware would be added here
    }

    // Add rate limiting if enabled
    if (config?.rateLimit?.enabled) {
      // Rate limiting middleware would be added here
    }

    // OpenAPI documentation
    if (config?.openapi?.enabled) {
      app.get("/openapi", openAPISpecs(app, {
        documentation: {
          info: {
            title: config.openapi.info?.title ?? "j8s Effect Service Manager API",
            version: config.openapi.info?.version ?? "2.0.0",
            description: config.openapi.info?.description ?? "Effect-based API for managing j8s services"
          },
          servers: config.openapi.servers ?? [
            { url: "http://localhost:3000", description: "Local Server" }
          ]
        }
      }));
    }

    // Scalar API reference
    if (config?.scalar?.enabled) {
      app.get("/scalar", Scalar({
        url: "/openapi",
        theme: config.scalar.theme ?? "deepSpace"
      }));
    }

    // List all services with enhanced information
    app.get(
      "/api/v2/services",
      describeRoute({
        description: "List all registered services with their configurations and status",
        responses: {
          200: {
            description: "List of services with enhanced details",
            content: {
              "application/json": { schema: resolver(ServicesListResponseSchema) }
            }
          }
        }
      }),
      effectHandler((c) =>
        Effect.gen(function* () {
          const { serviceManager } = yield* EffectAPIContext;
          const services = yield* serviceManager.services;
          
          const serviceDetails = yield* Effect.forEach(
            services,
            (service) =>
              Effect.gen(function* () {
                const status = yield* serviceManager.getServiceStatus(service.name);
                return {
                  name: service.name,
                  status,
                  config: service.config
                };
              }),
            { concurrency: "unbounded" }
          );

          return { services: serviceDetails };
        })
      )
    );

    // Get service details with comprehensive information
    app.get(
      "/api/v2/services/:name",
      describeRoute({
        description: "Get comprehensive details for a specific service",
        responses: {
          200: {
            description: "Service details with health and metrics",
            content: {
              "application/json": { schema: resolver(ServiceResponseSchema) }
            }
          },
          404: {
            description: "Service not found",
            content: {
              "application/json": { schema: resolver(ErrorResponseSchema) }
            }
          }
        }
      }),
      vValidator("param", ServiceNameSchema),
      effectHandler((c) =>
        Effect.gen(function* () {
          const { serviceManager } = yield* EffectAPIContext;
          const { name } = c.req.valid("param");
          
          const health = yield* serviceManager.healthCheckService(name);
          const status = yield* serviceManager.getServiceStatus(name);
          
          return {
            name,
            status,
            health
          };
        })
      )
    );

    // Start service with observability
    app.post(
      "/api/v2/services/:name/start",
      describeRoute({
        description: "Start a specific service with full observability",
        responses: {
          200: {
            description: "Service started successfully",
            content: {
              "application/json": { schema: resolver(MessageResponseSchema) }
            }
          }
        }
      }),
      vValidator("param", ServiceNameSchema),
      effectHandler((c) =>
        Effect.gen(function* () {
          const { serviceManager, observabilityManager } = yield* EffectAPIContext;
          const { name } = c.req.valid("param");
          
          yield* observabilityManager.trace(
            `api.start.${name}`,
            serviceManager.startService(name)
          );
          
          yield* observabilityManager.incrementCounter("api.service.start", { service: name });
          
          return {
            message: `Service '${name}' started successfully`,
            timestamp: new Date().toISOString()
          };
        })
      )
    );

    // Stop service with observability
    app.post(
      "/api/v2/services/:name/stop",
      describeRoute({
        description: "Stop a specific service with full observability",
        responses: {
          200: {
            description: "Service stopped successfully",
            content: {
              "application/json": { schema: resolver(MessageResponseSchema) }
            }
          }
        }
      }),
      vValidator("param", ServiceNameSchema),
      effectHandler((c) =>
        Effect.gen(function* () {
          const { serviceManager, observabilityManager } = yield* EffectAPIContext;
          const { name } = c.req.valid("param");
          
          yield* observabilityManager.trace(
            `api.stop.${name}`,
            serviceManager.stopService(name)
          );
          
          yield* observabilityManager.incrementCounter("api.service.stop", { service: name });
          
          return {
            message: `Service '${name}' stopped successfully`,
            timestamp: new Date().toISOString()
          };
        })
      )
    );

    // Restart service
    app.post(
      "/api/v2/services/:name/restart",
      describeRoute({
        description: "Restart a specific service",
        responses: {
          200: {
            description: "Service restarted successfully",
            content: {
              "application/json": { schema: resolver(MessageResponseSchema) }
            }
          }
        }
      }),
      vValidator("param", ServiceNameSchema),
      effectHandler((c) =>
        Effect.gen(function* () {
          const { serviceManager, observabilityManager } = yield* EffectAPIContext;
          const { name } = c.req.valid("param");
          
          yield* observabilityManager.trace(
            `api.restart.${name}`,
            serviceManager.restartService(name)
          );
          
          yield* observabilityManager.incrementCounter("api.service.restart", { service: name });
          
          return {
            message: `Service '${name}' restarted successfully`,
            timestamp: new Date().toISOString()
          };
        })
      )
    );

    // Health check endpoint
    app.get(
      "/api/v2/services/:name/health",
      describeRoute({
        description: "Get comprehensive health status for a service",
        responses: {
          200: {
            description: "Service health status",
            content: {
              "application/json": { schema: resolver(ServiceResponseSchema) }
            }
          }
        }
      }),
      vValidator("param", ServiceNameSchema),
      effectHandler((c) =>
        Effect.gen(function* () {
          const { serviceManager, observabilityManager } = yield* EffectAPIContext;
          const { name } = c.req.valid("param");
          
          const health = yield* observabilityManager.recordDuration(
            `api.health.${name}`,
            serviceManager.healthCheckService(name)
          );
          
          return health;
        })
      )
    );

    // Bulk operations
    app.post(
      "/api/v2/services/start-all",
      describeRoute({
        description: "Start all registered services",
        responses: {
          200: {
            description: "All services started",
            content: {
              "application/json": { schema: resolver(MessageResponseSchema) }
            }
          }
        }
      }),
      effectHandler((c) =>
        Effect.gen(function* () {
          const { serviceManager, observabilityManager } = yield* EffectAPIContext;
          
          yield* observabilityManager.trace(
            "api.start.all",
            serviceManager.startAllServices()
          );
          
          yield* observabilityManager.incrementCounter("api.service.start_all");
          
          return {
            message: "All services started successfully",
            timestamp: new Date().toISOString()
          };
        })
      )
    );

    // Metrics endpoint
    app.get(
      "/api/v2/metrics",
      describeRoute({
        description: "Get comprehensive service metrics",
        responses: {
          200: {
            description: "Service metrics",
            content: {
              "application/json": { schema: resolver(MetricsResponseSchema) }
            }
          }
        }
      }),
      effectHandler((c) =>
        Effect.gen(function* () {
          const { observabilityManager } = yield* EffectAPIContext;
          const metrics = yield* observabilityManager.getMetricsSnapshot();
          
          return {
            counters: Object.fromEntries(metrics.counters),
            gauges: Object.fromEntries(metrics.gauges),
            histograms: Object.fromEntries(
              Array.from(metrics.histograms.entries()).map(([key, values]) => [key, values])
            ),
            timestamp: new Date().toISOString()
          };
        })
      )
    );

    // Prometheus metrics endpoint
    app.get(
      "/api/v2/metrics/prometheus",
      describeRoute({
        description: "Get metrics in Prometheus format",
        responses: {
          200: {
            description: "Prometheus metrics",
            content: {
              "text/plain": { schema: { type: "string" } }
            }
          }
        }
      }),
      effectHandler((c) =>
        Effect.gen(function* () {
          const { observabilityManager } = yield* EffectAPIContext;
          const prometheusMetrics = yield* observabilityManager.exportPrometheusMetrics();
          
          c.res.headers.set("Content-Type", "text/plain");
          return prometheusMetrics;
        })
      )
    );

    // Server-Sent Events for real-time updates
    if (config?.streaming?.enabled) {
      app.get(
        "/api/v2/events",
        describeRoute({
          description: "Real-time service lifecycle events via Server-Sent Events",
          responses: {
            200: {
              description: "Event stream",
              content: {
                "text/event-stream": { schema: resolver(EventStreamSchema) }
              }
            }
          }
        }),
        async (c) => {
          c.res.headers.set("Content-Type", "text/event-stream");
          c.res.headers.set("Cache-Control", "no-cache");
          c.res.headers.set("Connection", "keep-alive");
          
          // This would implement SSE streaming in a real implementation
          return c.text("data: {\"type\":\"connection\",\"message\":\"Connected to j8s event stream\"}\n\n");
        }
      );
    }

    return app;
  });

/**
 * API layer that provides the Effect-based API
 */
export const EffectAPILayer = Layer.effect(
  "EffectAPI",
  Effect.gen(function* () {
    const serviceManager = yield* EffectServiceManager;
    const observabilityManager = yield* ObservabilityManager;
    
    return yield* createEffectServiceManagerAPI(serviceManager, observabilityManager);
  })
);