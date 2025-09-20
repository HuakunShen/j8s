/**
 * Effect.js integration for j8s
 *
 * This module provides Effect.js-based versions of the core j8s components,
 * allowing you to build services using functional programming patterns with
 * structured concurrency, error handling, and resource management.
 */

// Export Effect-based interfaces and types
export type {
  EffectHealthCheckResult,
  IEffectService,
  EffectCronJobConfig,
  EffectServiceConfig,
  IEffectServiceManager,
} from "./interfaces";

// Export Effect-based base service
export { BaseEffectService } from "./BaseEffectService";

// Export Effect-based service manager
export { EffectServiceManager } from "./EffectServiceManager";

// Export Effect-based worker service
export { EffectWorkerService, createEffectWorkerService } from "./EffectWorkerService";
export type { EffectWorkerServiceOptions } from "./EffectWorkerService";

// Export Effect-based expose function
export { effectExpose } from "./effectExpose";