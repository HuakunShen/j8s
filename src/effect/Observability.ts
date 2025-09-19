import { Effect, Layer, Context, Ref, Clock, pipe } from "effect";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import type { ObservabilityManager } from "./interfaces";

/**
 * Observability configuration
 */
export interface ObservabilityConfig {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly tracing?: {
    readonly enabled: boolean;
    readonly endpoint?: string;
    readonly sampleRate?: number;
  };
  readonly metrics?: {
    readonly enabled: boolean;
    readonly endpoint?: string;
    readonly collectInterval?: number;
  };
  readonly logging?: {
    readonly enabled: boolean;
    readonly endpoint?: string;
    readonly level?: "debug" | "info" | "warn" | "error";
  };
  readonly tags?: Record<string, string>;
}

/**
 * Metric types for service monitoring
 */
export interface ServiceMetrics {
  readonly counters: Map<string, number>;
  readonly gauges: Map<string, number>;
  readonly histograms: Map<string, number[]>;
  readonly timers: Map<string, { start: number; duration?: number }>;
}

/**
 * Trace span information
 */
export interface SpanInfo {
  readonly name: string;
  readonly startTime: number;
  readonly endTime?: number;
  readonly duration?: number;
  readonly tags: Record<string, string>;
  readonly status: "ok" | "error" | "timeout";
  readonly error?: unknown;
}

/**
 * Enhanced observability manager with comprehensive monitoring
 */
class ObservabilityManagerImpl implements ObservabilityManager {
  private readonly config: ObservabilityConfig;
  private readonly metrics: Ref.Ref<ServiceMetrics>;
  private readonly spans: Ref.Ref<Map<string, SpanInfo>>;
  private readonly sdk: NodeSDK | null = null;

  constructor(config: ObservabilityConfig) {
    this.config = config;
    this.metrics = Ref.unsafeMake({
      counters: new Map(),
      gauges: new Map(),
      histograms: new Map(),
      timers: new Map()
    });
    this.spans = Ref.unsafeMake(new Map());
    
    // Initialize OpenTelemetry SDK if tracing is enabled
    if (config.tracing?.enabled) {
      this.initializeSDK();
    }
  }

  /**
   * Initialize OpenTelemetry SDK
   */
  private initializeSDK(): void {
    const resource = new Resource({
      [SEMRESATTRS_SERVICE_NAME]: this.config.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: this.config.serviceVersion ?? "1.0.0",
      ...this.config.tags
    });

    const traceExporter = this.config.tracing?.endpoint
      ? new OTLPTraceExporter({
          url: this.config.tracing.endpoint
        })
      : undefined;

    const logExporter = this.config.logging?.endpoint
      ? new OTLPLogExporter({
          url: this.config.logging.endpoint
        })
      : undefined;

    // @ts-ignore - SDK initialization
    this.sdk = new NodeSDK({
      resource,
      traceExporter,
      logExporter,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    try {
      this.sdk.start();
      console.log("OpenTelemetry SDK initialized successfully");
    } catch (error) {
      console.error("Failed to initialize OpenTelemetry SDK:", error);
    }
  }

  /**
   * Trace an effect with span creation and measurement
   */
  readonly trace = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.gen(this, function* () {
      if (!this.config.tracing?.enabled) {
        return yield* effect;
      }

      const startTime = yield* Clock.currentTimeMillis;
      const spanId = `${name}_${startTime}`;

      // Create span info
      const spanInfo: SpanInfo = {
        name,
        startTime,
        tags: { ...this.config.tags },
        status: "ok"
      };

      yield* Ref.update(this.spans, spans => new Map(spans).set(spanId, spanInfo));

      try {
        // Execute the effect with span context
        const result = yield* Effect.withSpan(effect, name);
        
        // Update span with success
        const endTime = yield* Clock.currentTimeMillis;
        const duration = endTime - startTime;
        
        yield* Ref.update(this.spans, spans => {
          const updatedSpans = new Map(spans);
          updatedSpans.set(spanId, {
            ...spanInfo,
            endTime,
            duration,
            status: "ok"
          });
          return updatedSpans;
        });

        return result;

      } catch (error) {
        // Update span with error
        const endTime = yield* Clock.currentTimeMillis;
        const duration = endTime - startTime;
        
        yield* Ref.update(this.spans, spans => {
          const updatedSpans = new Map(spans);
          updatedSpans.set(spanId, {
            ...spanInfo,
            endTime,
            duration,
            status: "error",
            error
          });
          return updatedSpans;
        });

        throw error;
      }
    });

  /**
   * Increment a counter metric
   */
  readonly incrementCounter = (name: string, tags?: Record<string, string>): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      if (!this.config.metrics?.enabled) {
        return;
      }

      const metricKey = this.createMetricKey(name, tags);
      
      yield* Ref.update(this.metrics, metrics => ({
        ...metrics,
        counters: new Map(metrics.counters).set(metricKey, (metrics.counters.get(metricKey) ?? 0) + 1)
      }));

      // Log metric if logging is enabled
      if (this.config.logging?.enabled) {
        yield* Effect.log(`Counter incremented: ${metricKey}`);
      }
    });

  /**
   * Set a gauge metric value
   */
  readonly setGauge = (name: string, value: number, tags?: Record<string, string>): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      if (!this.config.metrics?.enabled) {
        return;
      }

      const metricKey = this.createMetricKey(name, tags);
      
      yield* Ref.update(this.metrics, metrics => ({
        ...metrics,
        gauges: new Map(metrics.gauges).set(metricKey, value)
      }));

      if (this.config.logging?.enabled) {
        yield* Effect.log(`Gauge set: ${metricKey} = ${value}`);
      }
    });

  /**
   * Record a histogram value
   */
  readonly recordHistogram = (name: string, value: number, tags?: Record<string, string>): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      if (!this.config.metrics?.enabled) {
        return;
      }

      const metricKey = this.createMetricKey(name, tags);
      
      yield* Ref.update(this.metrics, metrics => {
        const histograms = new Map(metrics.histograms);
        const existingValues = histograms.get(metricKey) ?? [];
        histograms.set(metricKey, [...existingValues, value]);
        
        return {
          ...metrics,
          histograms
        };
      });

      if (this.config.logging?.enabled) {
        yield* Effect.log(`Histogram recorded: ${metricKey} = ${value}`);
      }
    });

  /**
   * Record duration of an effect
   */
  readonly recordDuration = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.gen(this, function* () {
      if (!this.config.metrics?.enabled) {
        return yield* effect;
      }

      const startTime = yield* Clock.currentTimeMillis;
      
      try {
        const result = yield* effect;
        const endTime = yield* Clock.currentTimeMillis;
        const duration = endTime - startTime;
        
        yield* this.recordHistogram(`${name}.duration`, duration);
        yield* this.incrementCounter(`${name}.success`);
        
        return result;

      } catch (error) {
        const endTime = yield* Clock.currentTimeMillis;
        const duration = endTime - startTime;
        
        yield* this.recordHistogram(`${name}.duration`, duration);
        yield* this.incrementCounter(`${name}.error`);
        
        throw error;
      }
    });

  /**
   * Start a timer
   */
  readonly startTimer = (name: string, tags?: Record<string, string>): Effect.Effect<string, never, never> =>
    Effect.gen(this, function* () {
      const startTime = yield* Clock.currentTimeMillis;
      const timerId = `${name}_${startTime}`;
      const metricKey = this.createMetricKey(name, tags);
      
      yield* Ref.update(this.metrics, metrics => ({
        ...metrics,
        timers: new Map(metrics.timers).set(timerId, { start: startTime })
      }));

      return timerId;
    });

  /**
   * Stop a timer and record the duration
   */
  readonly stopTimer = (timerId: string): Effect.Effect<number, never, never> =>
    Effect.gen(this, function* () {
      const endTime = yield* Clock.currentTimeMillis;
      const metrics = yield* Ref.get(this.metrics);
      const timer = metrics.timers.get(timerId);
      
      if (!timer) {
        return 0;
      }

      const duration = endTime - timer.start;
      
      yield* Ref.update(this.metrics, metrics => {
        const timers = new Map(metrics.timers);
        timers.set(timerId, { ...timer, duration });
        return { ...metrics, timers };
      });

      return duration;
    });

  /**
   * Get current metrics snapshot
   */
  readonly getMetricsSnapshot = (): Effect.Effect<ServiceMetrics, never, never> =>
    Ref.get(this.metrics);

  /**
   * Get current spans snapshot
   */
  readonly getSpansSnapshot = (): Effect.Effect<Map<string, SpanInfo>, never, never> =>
    Ref.get(this.spans);

  /**
   * Reset all metrics
   */
  readonly resetMetrics = (): Effect.Effect<void, never, never> =>
    Ref.set(this.metrics, {
      counters: new Map(),
      gauges: new Map(),
      histograms: new Map(),
      timers: new Map()
    });

  /**
   * Export metrics in Prometheus format
   */
  readonly exportPrometheusMetrics = (): Effect.Effect<string, never, never> =>
    Effect.gen(this, function* () {
      const metrics = yield* Ref.get(this.metrics);
      const lines: string[] = [];

      // Export counters
      for (const [key, value] of metrics.counters) {
        lines.push(`# TYPE ${key} counter`);
        lines.push(`${key} ${value}`);
      }

      // Export gauges
      for (const [key, value] of metrics.gauges) {
        lines.push(`# TYPE ${key} gauge`);
        lines.push(`${key} ${value}`);
      }

      // Export histograms (simplified)
      for (const [key, values] of metrics.histograms) {
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;
        const avg = count > 0 ? sum / count : 0;
        
        lines.push(`# TYPE ${key} histogram`);
        lines.push(`${key}_sum ${sum}`);
        lines.push(`${key}_count ${count}`);
        lines.push(`${key}_avg ${avg}`);
      }

      return lines.join('\n');
    });

  /**
   * Create metric key with tags
   */
  private createMetricKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }

    const tagPairs = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');

    return `${name}{${tagPairs}}`;
  }

  /**
   * Cleanup observability resources
   */
  readonly shutdown = (): Effect.Effect<void, never, never> =>
    Effect.sync(() => {
      if (this.sdk) {
        try {
          this.sdk.shutdown();
          console.log("OpenTelemetry SDK shutdown successfully");
        } catch (error) {
          console.error("Error shutting down OpenTelemetry SDK:", error);
        }
      }
    });
}

/**
 * Health metrics collector for service monitoring
 */
export class HealthMetricsCollector {
  private readonly observabilityManager: ObservabilityManager;

  constructor(observabilityManager: ObservabilityManager) {
    this.observabilityManager = observabilityManager;
  }

  /**
   * Record service startup metrics
   */
  readonly recordServiceStartup = (serviceName: string, duration: number): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      yield* this.observabilityManager.incrementCounter("service.startup.total", { service: serviceName });
      yield* this.observabilityManager.recordHistogram("service.startup.duration", duration, { service: serviceName });
    });

  /**
   * Record service shutdown metrics
   */
  readonly recordServiceShutdown = (serviceName: string, duration: number): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      yield* this.observabilityManager.incrementCounter("service.shutdown.total", { service: serviceName });
      yield* this.observabilityManager.recordHistogram("service.shutdown.duration", duration, { service: serviceName });
    });

  /**
   * Record service error metrics
   */
  readonly recordServiceError = (serviceName: string, errorType: string): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      yield* this.observabilityManager.incrementCounter("service.errors.total", { 
        service: serviceName, 
        error_type: errorType 
      });
    });

  /**
   * Record service health check metrics
   */
  readonly recordHealthCheck = (serviceName: string, status: string, duration: number): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      yield* this.observabilityManager.incrementCounter("service.health_check.total", { 
        service: serviceName, 
        status 
      });
      yield* this.observabilityManager.recordHistogram("service.health_check.duration", duration, { 
        service: serviceName 
      });
    });

  /**
   * Record service restart metrics
   */
  readonly recordServiceRestart = (serviceName: string, restartCount: number): Effect.Effect<void, never, never> =>
    Effect.gen(this, function* () {
      yield* this.observabilityManager.incrementCounter("service.restarts.total", { service: serviceName });
      yield* this.observabilityManager.setGauge("service.restart_count", restartCount, { service: serviceName });
    });
}

/**
 * Observability layer factory
 */
export const makeObservabilityLayer = (config: ObservabilityConfig) =>
  Layer.effect(
    ObservabilityManager,
    Effect.sync(() => new ObservabilityManagerImpl(config))
  );

/**
 * Default observability configuration
 */
export const defaultObservabilityConfig: ObservabilityConfig = {
  serviceName: "j8s-service",
  serviceVersion: "1.0.0",
  tracing: {
    enabled: process.env.NODE_ENV !== "test",
    sampleRate: 1.0
  },
  metrics: {
    enabled: true,
    collectInterval: 60000 // 1 minute
  },
  logging: {
    enabled: true,
    level: "info"
  },
  tags: {
    environment: process.env.NODE_ENV ?? "development"
  }
};