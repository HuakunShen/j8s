/**
 * Effect-based j8s - JavaScript Service Orchestrator
 * 
 * A complete rewrite of j8s using the Effect library for:
 * - Built-in exponential backoff (no manual implementation)
 * - Effect's Cron scheduling (replacing cron package)
 * - Structured error handling
 * - Service layer dependency injection  
 * - Fiber-based concurrency
 * - Observability and tracing
 * - Resource safety
 * 
 * This provides all the features of the original j8s with enhanced reliability,
 * better error handling, and modern TypeScript patterns.
 */

import type { CronJobConfig } from "../src/interface"
import { CronPatterns, CronScheduling } from "./scheduling/cron"
import { Schedules } from "./scheduling/schedules"
import { BaseEffectService } from "./services/BaseEffectService"

// Core interfaces and types
export type {
  ServiceStatus,
  RestartPolicy,
  HealthCheckResult,
  IEffectService,
  CronJobConfig,
  ServiceConfig,
  IServiceRegistry
} from "./services/interfaces"

export {
  ServiceError,
  ServiceNotFoundError,
  ServiceAlreadyExistsError,
  HealthCheckError,
  ServiceRegistry
} from "./services/interfaces"

// Base service class
export { BaseEffectService } from "./services/BaseEffectService"

// Scheduling and retry policies
export { Schedules, ScheduleBuilder } from "./scheduling/schedules"
export { 
  CronScheduling, 
  CronPatterns, 
  runOnSchedule, 
  createCronJob 
} from "./scheduling/cron"

// Resilience and error handling
export {
  RetryStrategies,
  ResiliencePolicies,
  CircuitBreakerError,
  TimeoutError,
  BulkheadError
} from "./resilience/retry"

// Service registry
export {
  makeServiceRegistry,
  ServiceRegistryLive
} from "./registry/ServiceRegistry"

// Health monitoring  
export type {
  IHealthMonitor,
  HealthMonitorConfig,
  HealthAlert,
  OverallHealth
} from "./health/monitor"

export {
  makeHealthMonitor,
  HealthMonitor,
  HealthMonitorLive
} from "./health/monitor"

// Worker services
export {
  EffectWorkerService,
  createEffectWorkerService
} from "./workers/EffectWorkerService"

export type { EffectWorkerOptions } from "./workers/EffectWorkerService"

export { exposeEffect, runExposeEffect } from "./workers/expose"

// Main service manager
export type { IEffectServiceManager } from "./runtime/EffectServiceManager"

export {
  makeEffectServiceManager,
  EffectServiceManager,
  EffectServiceManagerLive,
  EffectServiceManagerOperations
} from "./runtime/EffectServiceManager"

// Observability and tracing
export {
  ServiceMetrics,
  ServiceTracing,
  ServiceLogger,
  ObservabilityLive,
  ObservabilityDev,
  ObservabilityProd,
  PerformanceMonitoring
} from "./observability/tracing"

// API layer
export type { EffectAPIConfig } from "./api/EffectAPI"
export { createEffectAPI, runEffectAPIServer } from "./api/EffectAPI"

// Re-export Effect essentials for convenience
export { Effect, Context, Console, Duration, Schedule, Cron } from "effect"

/**
 * Quick start helpers for common use cases
 */
export const EffectJ8s = {
  /**
   * Create a simple service from functions
   */
  createSimpleService: (
    name: string,
    startFn: () => Promise<void> | void,
    stopFn?: () => Promise<void> | void
  ) => BaseEffectService.fromPromise(
    name,
    typeof startFn === "function" 
      ? () => Promise.resolve(startFn())
      : startFn,
    stopFn 
      ? typeof stopFn === "function"
        ? () => Promise.resolve(stopFn())
        : stopFn
      : undefined
  ),

  /**
   * Common cron schedules
   */
  schedules: {
    daily: (hour: number = 0) => CronScheduling.daily(hour),
    hourly: () => CronScheduling.hourly(),
    every5Minutes: () => CronScheduling.everyMinutes(5),
    backup: () => CronPatterns.backup,
    healthCheck: () => CronPatterns.healthCheck,
    maintenance: () => CronPatterns.maintenance
  },

  /**
   * Common retry policies
   */
  retries: {
    exponential: () => Schedules.exponentialBackoff,
    linear: () => Schedules.linearBackoff,
    fibonacci: () => Schedules.fibonacciBackoff,
    quick: () => Schedules.retryWithLimit(3, "100 millis"),
    aggressive: () => Schedules.retryWithLimit(10, "50 millis")
  },

  /**
   * Service configurations
   */
  configs: {
    alwaysRestart: () => ({ restartPolicy: "always" as const }),
    onFailure: (maxRetries: number = 3) => ({ 
      restartPolicy: "on-failure" as const, 
      maxRetries 
    }),
    neverRestart: () => ({ restartPolicy: "no" as const }),
    withCron: (cronConfig: CronJobConfig) => ({ cronJob: cronConfig }),
    withRetries: (retrySchedule: any) => ({ retrySchedule })
  }
} as const
