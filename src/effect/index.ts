/**
 * j8s Effect Integration - Main Export Module
 * 
 * This module provides the main exports for the Effect-based j8s system,
 * including all core services, utilities, and compatibility layers.
 */

// Core Effect Services
export { BaseEffectService } from "./BaseEffectService";
export { EffectWorkerService } from "./EffectWorkerService";
export { EffectCronService } from "./EffectCronService";

// Service Management
export { 
  EffectServiceManagerLive, 
  ServiceContextLive, 
  EffectServiceRuntime 
} from "./EffectServiceManager";

// Interfaces and Types
export type {
  EffectService,
  EffectServiceManager,
  EffectServiceConfig,
  ServiceContext,
  ServiceRegistry,
  ScheduleManager,
  ResourceManager,
  ObservabilityManager,
  RetryPolicy,
  ServiceLifecycleEvent,
  EffectHealthStatus
} from "./interfaces";

// Error Types
export {
  ServiceError,
  StartupError,
  ShutdownError,
  HealthCheckError,
  WorkerError,
  ScheduleError,
  APIError,
  ValidationError,
  NotFoundError,
  ConflictError,
  InternalError
} from "./errors";

export type {
  AllServiceErrors,
  AllAPIErrors,
  AllErrors
} from "./errors";

// Retry Policies
export {
  RetryPolicyBuilder,
  ScheduleFactory,
  CommonRetryPolicies,
  ScheduleUtils
} from "./RetryPolicies";

export type {
  AdvancedRetryPolicy
} from "./RetryPolicies";

// Observability
export {
  makeObservabilityLayer,
  defaultObservabilityConfig,
  HealthMetricsCollector
} from "./Observability";

export type {
  ObservabilityConfig,
  ServiceMetrics,
  SpanInfo
} from "./Observability";

// Effect API
export {
  createEffectServiceManagerAPI,
  EffectAPILayer
} from "./EffectAPI";

export type {
  EffectAPIConfig,
  EffectAPIContext
} from "./EffectAPI";

// Compatibility Layer
export {
  LegacyServiceAdapter,
  EffectServiceAdapter,
  HybridServiceManager,
  MigrationUtilities,
  ManagerFactory,
  HybridManagerLayer,
  CompatibilityLayer,
  runWithEffectSupport
} from "./CompatibilityLayer";

// Context Tags
export {
  ServiceContext,
  ServiceRegistry,
  ScheduleManager,
  ResourceManager,
  ObservabilityManager,
  EffectServiceManager,
  ServiceLayer
} from "./interfaces";

/**
 * Convenience re-exports from Effect ecosystem
 */
export { Effect, Layer, Context, Schedule, Ref, Clock, Console } from "effect";