# Best Practices

<cite>
**Referenced Files in This Document**   
- [BaseService.ts](file://src/BaseService.ts)
- [WorkerService.ts](file://src/WorkerService.ts)
- [ServiceManager.ts](file://src/ServiceManager.ts)
- [api.ts](file://src/api.ts)
- [logService.ts](file://examples/services/logService.ts)
- [vitest.config.ts](file://vitest.config.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Service Design Patterns](#service-design-patterns)
3. [Choosing Between BaseService and WorkerService](#choosing-between-baseservice-and-workerservice)
4. [Restart Policy Configuration](#restart-policy-configuration)
5. [Performance Considerations](#performance-considerations)
6. [Testing Approaches with Vitest](#testing-approaches-with-vitest)
7. [Monitoring and Health Check Integration](#monitoring-and-health-check-integration)
8. [Production Deployment Recommendations](#production-deployment-recommendations)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

## Introduction
This document outlines best practices for effectively using j8s, a lightweight JavaScript/TypeScript service orchestration framework. It provides guidance on designing robust services, managing state, isolating errors, configuring restart policies, and ensuring optimal performance. The recommendations are based on the framework's architecture and implementation patterns as observed in the codebase.

## Service Design Patterns

### State Management
When implementing services, maintain internal state within the service class using private properties. The `BaseService` and `WorkerService` classes are designed to encapsulate state related to service lifecycle (e.g., running, stopping, crashed). For example, in `logService.ts`, the `LoggingService` class manages its operational state via `isRunning`, `logInterval`, and `startTime` fields.

Ensure that state transitions are synchronized with lifecycle methods (`start`, `stop`) and that health checks reflect the current state accurately.

### Error Isolation
To isolate errors, especially in worker-based services, leverage the `WorkerService` wrapper which runs code in a separate thread. This prevents failures in one service from affecting others. The framework handles worker errors by setting the status to `"crashed"` and triggering restart logic based on policy.

In main-thread services, avoid unhandled rejections by properly catching and handling exceptions within `start()` and `stop()` methods.

### Graceful Shutdown
Implement graceful shutdown by cleaning up resources in the `stop()` method. For example, `logService.ts` clears intervals and sets flags to stop ongoing operations. Always ensure that asynchronous tasks are properly terminated and that no orphaned timers or listeners remain.

Register process-level signals (SIGINT, SIGTERM) to trigger `stopAllServices()` on application exit, as demonstrated in `demo.ts`.

**Section sources**
- [logService.ts](file://examples/services/logService.ts#L0-L43)
- [demo.ts](file://examples/demo.ts#L145-L165)

## Choosing Between BaseService and WorkerService

### BaseService
Use `BaseService` for lightweight, short-lived, or I/O-bound tasks that do not block the event loop. These services run in the main thread and are suitable when tight integration with other components is needed.

**When to use:**
- Simple cron jobs
- Services requiring frequent communication with main-thread components
- Lightweight monitoring or logging tasks

### WorkerService
Use `WorkerService` for CPU-intensive tasks, long-running operations, or when you need stronger fault isolation. Worker threads prevent blocking the main event loop and provide memory isolation.

**When to use:**
- Data processing pipelines
- Heavy computational tasks
- Third-party integrations with unpredictable behavior
- Services requiring restart without affecting the main process

The decision should be based on workload characteristics: use `WorkerService` when resource isolation or non-blocking execution is critical.

**Section sources**
- [BaseService.ts](file://src/BaseService.ts#L0-L25)
- [WorkerService.ts](file://src/WorkerService.ts#L0-L193)

## Restart Policy Configuration

j8s supports four restart policies: `"always"`, `"unless-stopped"`, `"on-failure"`, and `"no"`. Configure these based on service criticality and failure tolerance.

- `"always"`: Restart regardless of exit status. Suitable for critical services.
- `"on-failure"`: Restart only after failure, with optional `maxRetries`. Use for resilient but non-critical services.
- `"unless-stopped"`: Restart unless explicitly stopped by user.
- `"no"`: Never restart. Use for one-off or debugging services.

The framework implements exponential backoff with a base delay of 1 second and maximum of 30 seconds between restart attempts. This prevents overwhelming the system during repeated failures.

Configure `maxRetries` to prevent infinite restart loops. For example, setting `maxRetries: 3` limits recovery attempts before giving up.

**Section sources**
- [ServiceManager.ts](file://src/ServiceManager.ts#L238-L286)
- [worker-restart-policy.ts](file://examples/worker-restart-policy.ts#L0-L35)
- [restart-policy.ts](file://examples/restart-policy.ts#L48-L74)

## Performance Considerations

### Worker Thread Utilization
Efficiently utilize worker threads by matching the number of workers to available CPU cores for CPU-bound tasks. Avoid creating excessive workers that could lead to context switching overhead.

The `WorkerService` class manages worker lifecycle efficiently by reinitializing workers on restart and cleaning up resources properly.

### Memory Management
Ensure that services release memory-holding resources (e.g., buffers, caches, intervals) during `stop()`. Worker threads are terminated and recreated on restart, which helps mitigate memory leaks.

Monitor memory usage in long-running services and consider periodic restarts for services prone to gradual memory growth.

Avoid passing large `workerData` objects unnecessarily, as they are serialized during worker creation.

**Section sources**
- [WorkerService.ts](file://src/WorkerService.ts#L0-L193)
- [ServiceManager.ts](file://src/ServiceManager.ts#L104-L152)

## Testing Approaches with Vitest

Use Vitest for unit and integration testing of service logic and lifecycle behavior. The configuration in `vitest.config.ts` sets up a Node.js environment with global APIs enabled, making it ideal for testing asynchronous service methods.

**Recommended testing strategies:**
- Mock dependencies and verify `start()` and `stop()` behavior
- Test health check responses under different internal states
- Validate error handling and rejection paths
- Use `vi.useFakeTimers()` to test time-based logic (e.g., intervals, timeouts)

Write tests that assert state transitions and side effects (e.g., console logs, external calls) to ensure correctness.

**Section sources**
- [vitest.config.ts](file://vitest.config.ts#L0-L8)

## Monitoring and Health Check Integration

All services must implement the `healthCheck()` method to expose operational status. The framework integrates health checks into a REST API endpoint (`/api/health`) that returns aggregated status for all services.

The `healthCheck()` method should return meaningful details such as uptime, error counts, or processing metrics. For example, `logService.ts` includes uptime in seconds and log status.

The REST API provides standardized endpoints:
- `GET /api/health` - Overall health
- `GET /api/services/:name/health` - Per-service health
- `GET /api/services` - List all services

These endpoints are validated using schema definitions in `api.ts` and return consistent JSON responses.

**Section sources**
- [logService.ts](file://examples/services/logService.ts#L37-L43)
- [api.ts](file://src/api.ts#L401-L464)
- [api.ts](file://src/api.ts#L366-L399)

## Production Deployment Recommendations

### Logging
Implement structured logging within services. While j8s does not enforce a logging library, follow consistent patterns across services. The `logService.ts` example demonstrates basic logging of lifecycle events.

Consider integrating with external logging systems for production environments.

### Configuration Management
Pass configuration via `workerData` when creating `WorkerService` instances. Use environment variables or configuration files to manage settings across environments.

Avoid hardcoding values; instead, inject configuration through service constructors or worker data.

### API and UI
Enable the built-in REST API using `createServiceManagerAPI()` for remote service management. Optionally enable OpenAPI/Swagger documentation and Scalar UI for better observability.

Secure the API in production using authentication middleware, as the current implementation does not include built-in security.

**Section sources**
- [logService.ts](file://examples/services/logService.ts#L0-L43)
- [api.ts](file://src/api.ts#L69-L125)

## Anti-Patterns to Avoid

### Blocking the Event Loop
Never perform CPU-intensive operations in `BaseService` implementations, as they run in the main thread and can block the event loop. Offload such work to `WorkerService` instances.

Avoid long synchronous operations or infinite loops without yielding control.

### Improper Resource Cleanup
Failing to clean up timers, intervals, or listeners in the `stop()` method can lead to memory leaks and unexpected behavior. Always cancel scheduled tasks and release resources.

### Overusing Restart Policies
Setting `restartPolicy: "always"` for non-critical or failing services can lead to resource exhaustion. Use `"on-failure"` with `maxRetries` to allow recovery while preventing infinite restart cycles.

### Ignoring Health Check Accuracy
Ensure that `healthCheck()` reflects the true operational state. Avoid returning static or misleading health information, as this undermines monitoring systems.

**Section sources**
- [BaseService.ts](file://src/BaseService.ts#L0-L25)
- [WorkerService.ts](file://src/WorkerService.ts#L0-L193)
- [ServiceManager.ts](file://src/ServiceManager.ts#L238-L286)