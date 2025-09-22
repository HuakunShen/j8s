import { 
  Effect, 
  Context, 
  Console, 
  Metric, 
  Logger,
  LogLevel,
  Duration,
  FiberId
} from "effect"

/**
 * Service metrics using Effect's built-in Metric system
 */
export const ServiceMetrics = {
  serviceStarts: Metric.counter("j8s_service_starts_total", {
    description: "Total number of service starts"
  }),
  
  serviceStops: Metric.counter("j8s_service_stops_total", {
    description: "Total number of service stops"
  }),
  
  serviceFailures: Metric.counter("j8s_service_failures_total", {
    description: "Total number of service failures"
  }),
  
  serviceRestarts: Metric.counter("j8s_service_restarts_total", {
    description: "Total number of service restarts"
  }),
  
  activeServices: Metric.gauge("j8s_active_services", {
    description: "Number of currently active services"
  }),
  
  healthCheckDuration: Metric.histogram("j8s_health_check_duration_ms", {
    description: "Health check duration in milliseconds"
  }),
  
  serviceUptime: Metric.histogram("j8s_service_uptime_seconds", {
    description: "Service uptime in seconds"
  })
} as const

/**
 * Tracing utilities for j8s services
 */
export const ServiceTracing = {
  /**
   * Trace a service operation with metrics
   */
  traceServiceOperation: <A, E, R>(
    operation: string,
    serviceName: string,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.withSpan(operation, { 
        attributes: { 
          serviceName,
          operation,
          component: "j8s" 
        }
      }),
      Effect.tapBoth({
        onFailure: (error) => Effect.gen(function* () {
          yield* Effect.sync(() => Metric.increment(ServiceMetrics.serviceFailures))
          yield* Console.error(`Service operation failed: ${operation} for ${serviceName}`, error)
        }),
        onSuccess: () => Effect.gen(function* () {
          yield* Console.debug(`Service operation completed: ${operation} for ${serviceName}`)
        })
      })
    ),

  /**
   * Trace service lifecycle events
   */
  traceServiceStart: (serviceName: string) => 
    Effect.gen(function* () {
      yield* Effect.sync(() => Metric.increment(ServiceMetrics.serviceStarts))
      yield* Console.log(`📦 Service starting: ${serviceName}`)
    }).pipe(
      Effect.withSpan("service.start", {
        attributes: { serviceName, event: "start" }
      })
    ),

  traceServiceStop: (serviceName: string) =>
    Effect.gen(function* () {
      yield* Effect.sync(() => Metric.increment(ServiceMetrics.serviceStops))
      yield* Console.log(`🛑 Service stopping: ${serviceName}`)
    }).pipe(
      Effect.withSpan("service.stop", {
        attributes: { serviceName, event: "stop" }
      })
    ),

  traceServiceRestart: (serviceName: string, attempt: number) =>
    Effect.gen(function* () {
      yield* Effect.sync(() => Metric.increment(ServiceMetrics.serviceRestarts))
      yield* Console.warn(`🔄 Service restarting: ${serviceName} (attempt ${attempt})`)
    }).pipe(
      Effect.withSpan("service.restart", {
        attributes: { serviceName, event: "restart", attempt }
      })
    ),

  /**
   * Trace health checks with timing
   */
  traceHealthCheck: <A, E, R>(
    serviceName: string,
    healthCheck: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    Effect.gen(function* () {
      const start = yield* Effect.sync(() => Date.now())
      
      const result = yield* healthCheck.pipe(
        Effect.tapBoth({
          onFailure: (error) => Console.warn(`❌ Health check failed for ${serviceName}:`, error),
          onSuccess: () => Console.debug(`✅ Health check passed for ${serviceName}`)
        })
      )
      
      const duration = yield* Effect.sync(() => Date.now() - start)
      yield* Effect.sync(() => Metric.set(ServiceMetrics.healthCheckDuration, duration))
      
      return result
    }).pipe(
      Effect.withSpan("health.check", {
        attributes: { serviceName, component: "health" }
      })
    ),

  /**
   * Create a traced service wrapper
   */
  withTracing: <T extends { name: string }>(service: T) => ({
    ...service,
    start: service.start
      ? ServiceTracing.traceServiceOperation("start", service.name, service.start)
      : undefined,
    stop: service.stop
      ? ServiceTracing.traceServiceOperation("stop", service.name, service.stop)  
      : undefined,
    healthCheck: service.healthCheck
      ? ServiceTracing.traceHealthCheck(service.name, service.healthCheck)
      : undefined
  })
} as const

/**
 * Logger configuration for j8s
 */
export const ServiceLogger = Logger.make(({ logLevel, message, spans, annotations }) => {
  const timestamp = new Date().toISOString()
  const level = logLevel.label.toUpperCase().padEnd(5)
  
  // Extract service name from spans if available
  const serviceName = spans.find(span => 
    span.attributes.get("serviceName")
  )?.attributes.get("serviceName") || "j8s"
  
  const logEntry = {
    timestamp,
    level: logLevel.label,
    service: serviceName,
    message: message.map(m => typeof m === "string" ? m : JSON.stringify(m)).join(" "),
    ...(spans.length > 0 && {
      spans: spans.map(span => ({
        name: span.name,
        attributes: Object.fromEntries(span.attributes.entries())
      }))
    }),
    ...(annotations.size > 0 && {
      annotations: Object.fromEntries(annotations.entries())
    })
  }

  // Console output with colors based on level
  const colorCode = {
    TRACE: "\x1b[90m", // gray
    DEBUG: "\x1b[36m", // cyan  
    INFO: "\x1b[32m",  // green
    WARN: "\x1b[33m",  // yellow
    ERROR: "\x1b[31m", // red
    FATAL: "\x1b[35m"  // magenta
  }[level] || "\x1b[0m"

  console.log(`${colorCode}[${timestamp}] ${level} ${serviceName}: ${logEntry.message}\x1b[0m`)
  
  // Also output structured JSON for log aggregation systems
  if (logLevel._tag !== "Trace" && logLevel._tag !== "Debug") {
    console.log(JSON.stringify(logEntry))
  }
})

/**
 * Observability layer that includes metrics, tracing, and logging
 */
export const ObservabilityLive = Context.Layer.mergeAll(
  Logger.replace(Logger.defaultLogger, ServiceLogger),
  Logger.minimumLogLevel(LogLevel.Info)
)

/**
 * Development observability with debug logging
 */
export const ObservabilityDev = Context.Layer.mergeAll(
  Logger.replace(Logger.defaultLogger, ServiceLogger),
  Logger.minimumLogLevel(LogLevel.Debug)
)

/**
 * Production observability with structured logging only
 */
export const ObservabilityProd = Context.Layer.mergeAll(
  Logger.replace(Logger.defaultLogger, ServiceLogger),
  Logger.minimumLogLevel(LogLevel.Info)
)

/**
 * Performance monitoring utilities
 */
export const PerformanceMonitoring = {
  /**
   * Monitor service performance over time
   */
  monitorServicePerformance: (
    serviceName: string,
    operation: Effect.Effect<any, any, any>
  ) =>
    operation.pipe(
      Effect.timed,
      Effect.tap(([duration]) => 
        Effect.sync(() => {
          const ms = Duration.toMillis(duration)
          Console.log(`⏱️  Service ${serviceName} operation took ${ms}ms`)
          
          // Record performance metrics
          if (ms > 5000) {
            Console.warn(`🐌 Slow operation detected for ${serviceName}: ${ms}ms`)
          }
        })
      ),
      Effect.map(([, result]) => result)
    ),

  /**
   * Track service uptime
   */
  trackUptime: (serviceName: string, startTime: Date) =>
    Effect.sync(() => {
      const uptimeSeconds = (Date.now() - startTime.getTime()) / 1000
      Metric.set(ServiceMetrics.serviceUptime, uptimeSeconds)
      return uptimeSeconds
    }),

  /**
   * Report system-wide metrics
   */
  reportMetrics: () => Effect.gen(function* () {
    yield* Console.log("📊 j8s System Metrics:")
    yield* Console.log("  Service Starts:", yield* Effect.sync(() => 
      Metric.value(ServiceMetrics.serviceStarts)))
    yield* Console.log("  Service Stops:", yield* Effect.sync(() => 
      Metric.value(ServiceMetrics.serviceStops)))
    yield* Console.log("  Service Failures:", yield* Effect.sync(() => 
      Metric.value(ServiceMetrics.serviceFailures)))
    yield* Console.log("  Active Services:", yield* Effect.sync(() => 
      Metric.value(ServiceMetrics.activeServices)))
  })
} as const
