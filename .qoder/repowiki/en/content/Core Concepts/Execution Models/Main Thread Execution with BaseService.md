# Main Thread Execution with BaseService

<cite>
**Referenced Files in This Document**   
- [BaseService.ts](file://src/BaseService.ts)
- [ServiceManager.ts](file://src/ServiceManager.ts)
- [interface.ts](file://src/interface.ts)
- [examples/services/logService.ts](file://examples/services/logService.ts)
- [examples/rest-api.ts](file://examples/rest-api.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [BaseService Implementation](#baseservice-implementation)
3. [Lifecycle Management](#lifecycle-management)
4. [Health Check Mechanism](#health-check-mechanism)
5. [Main Thread Execution Model](#main-thread-execution-model)
6. [Use Cases and Best Practices](#use-cases-and-best-practices)
7. [Limitations and Risks](#limitations-and-risks)
8. [Contrast with Worker-Thread Execution](#contrast-with-worker-thread-execution)
9. [Custom Service Implementation Guide](#custom-service-implementation-guide)
10. [Integration with ServiceManager](#integration-with-servicemanager)

## Introduction
The BaseService class provides a foundational abstraction for services that execute within the main Node.js event loop. This model enables lightweight, tightly integrated services that share memory and execution context with the primary application process. By extending BaseService, developers can create services that benefit from direct access to main-thread resources while adhering to a standardized lifecycle management pattern enforced by the ServiceManager.

## BaseService Implementation

The BaseService class serves as an abstract foundation for all main-thread services, implementing the IService interface and providing a consistent structure for service definition.

```mermaid
classDiagram
class BaseService {
+string name
+constructor(name : string)
+abstract start() : Promise~void~
+abstract stop() : Promise~void~
+healthCheck() : Promise~HealthCheckResult~
}
class IService {
<<interface>>
+string name
+start() : Promise~void~
+stop() : Promise~void~
+healthCheck() : Promise~HealthCheckResult~
}
BaseService ..|> IService
```

**Diagram sources**
- [BaseService.ts](file://src/BaseService.ts#L6-L25)
- [interface.ts](file://src/interface.ts#L13-L18)

**Section sources**
- [BaseService.ts](file://src/BaseService.ts#L6-L25)

## Lifecycle Management

BaseService defines two abstract lifecycle methods that must be implemented by all extending classes: `start()` and `stop()`. These methods represent the core execution points for service initialization and cleanup.

The ServiceManager orchestrates the execution of these methods, managing service state transitions between "stopped", "running", and "stopping" statuses. When a service is started, the ServiceManager sets its status to "running" and invokes the `start()` method asynchronously, allowing long-running services to maintain their execution context without blocking the event loop.

```mermaid
sequenceDiagram
participant Manager as ServiceManager
participant Service as BaseService
participant EventLoop as Node.js Event Loop
Manager->>Service : startService()
Manager->>Service : Set status to "running"
Manager->>Service : Call start()
Service->>EventLoop : Register async operations
Service-->>Manager : Return Promise
Manager->>Manager : Monitor service state
Manager->>Service : Call stop() on shutdown
Service->>EventLoop : Clean up resources
Service-->>Manager : Resolve stop() Promise
Manager->>Manager : Set status to "stopped"
```

**Diagram sources**
- [ServiceManager.ts](file://src/ServiceManager.ts#L79-L114)
- [BaseService.ts](file://src/BaseService.ts#L15-L17)

**Section sources**
- [ServiceManager.ts](file://src/ServiceManager.ts#L79-L114)
- [BaseService.ts](file://src/BaseService.ts#L15-L17)

## Health Check Mechanism

BaseService provides a default implementation of the `healthCheck()` method that returns a minimal health status. This implementation returns a "stopped" status with empty details, as the ServiceManager will override the status field with the actual managed state of the service.

Services can override this method to provide additional health details while relying on the ServiceManager to supply the authoritative status. This separation of concerns ensures consistent status reporting across all services while allowing individual services to expose custom health metrics.

```mermaid
flowchart TD
Start([healthCheck called]) --> Default["Return default response"]
Default --> Status["status: 'stopped'"]
Status --> Details["details: {}"]
Details --> Manager["ServiceManager overrides status"]
Manager --> Actual["Actual status from service entry"]
Actual --> Return["Return final HealthCheckResult"]
```

**Diagram sources**
- [BaseService.ts](file://src/BaseService.ts#L19-L25)
- [ServiceManager.ts](file://src/ServiceManager.ts#L225-L235)

**Section sources**
- [BaseService.ts](file://src/BaseService.ts#L19-L25)

## Main Thread Execution Model

Services extending BaseService execute within the main Node.js event loop, sharing memory space and execution context with other services and the primary application. This model is ideal for lightweight operations that perform I/O-bound tasks or require direct access to shared resources.

The execution model relies on asynchronous programming patterns to prevent blocking the event loop. Services typically use timers, event emitters, or promise-based APIs to perform non-blocking operations. Long-running services maintain their execution by returning promises that resolve only when the `stop()` method is called.

```mermaid
graph TB
subgraph "Main Thread"
SM[ServiceManager]
S1[Service 1]
S2[Service 2]
S3[Service 3]
end
subgraph "Event Loop"
Timer[Timers]
IO[Pending I/O]
Idle[Idle/Prepare]
Poll[Poll]
Check[Check]
Close[Close]
end
SM --> S1
SM --> S2
SM --> S3
S1 --> Timer
S2 --> IO
S3 --> Poll
```

**Diagram sources**
- [ServiceManager.ts](file://src/ServiceManager.ts#L79-L114)
- [examples/rest-api.ts](file://examples/rest-api.ts#L20-L53)

**Section sources**
- [ServiceManager.ts](file://src/ServiceManager.ts#L79-L114)

## Use Cases and Best Practices

Main-thread execution is preferred for services with low computational overhead or those requiring direct access to main-thread resources. Typical use cases include:

- Logging services that write to shared output streams
- Monitoring services that track application metrics
- Event-driven processors that respond to internal events
- API clients that maintain persistent connections
- Caching services that store data in memory

When implementing services for main-thread execution, follow these best practices:
- Use asynchronous operations to avoid blocking the event loop
- Implement proper cleanup in the `stop()` method
- Limit CPU-intensive operations to prevent performance degradation
- Use the healthCheck method to expose service-specific metrics
- Leverage ServiceManager configuration options like restart policies

```mermaid
erDiagram
SERVICE : "BaseService" {
string name PK
status status
config config
}
CONFIG : "ServiceConfig" {
string restartPolicy
number maxRetries
cronJob cronJob
}
STATUS : "ServiceStatus" {
enum status
}
SERVICE ||--o{ CONFIG : "has"
SERVICE }|--|| STATUS : "current"
```

**Diagram sources**
- [interface.ts](file://src/interface.ts#L1-L28)
- [BaseService.ts](file://src/BaseService.ts#L6-L25)

**Section sources**
- [examples/services/logService.ts](file://examples/services/logService.ts#L6-L42)

## Limitations and Risks

While the main-thread execution model offers simplicity and direct resource access, it carries inherent risks. The primary limitation is the potential to block the Node.js event loop with CPU-intensive tasks, which can degrade application performance and responsiveness.

Services that perform heavy computation, large data processing, or synchronous operations can monopolize the event loop, preventing other services and application code from executing. Additionally, unhandled exceptions in main-thread services can potentially crash the entire process.

The ServiceManager mitigates some risks by isolating service failures and implementing restart policies, but fundamentally blocking operations cannot be recovered through orchestration alone. Developers must carefully evaluate the computational requirements of their services before choosing main-thread execution.

```mermaid
flowchart LR
A[Service Operation] --> B{CPU Intensive?}
B --> |Yes| C[Blocks Event Loop]
B --> |No| D[Non-blocking I/O]
C --> E[Performance Degradation]
C --> F[Unresponsive Application]
D --> G[Normal Operation]
E --> H[System Instability]
F --> H
H --> I[Service Restart]
I --> J[Potential Data Loss]
```

**Diagram sources**
- [ServiceManager.ts](file://src/ServiceManager.ts#L93-L102)
- [BaseService.ts](file://src/BaseService.ts#L15-L17)

**Section sources**
- [ServiceManager.ts](file://src/ServiceManager.ts#L93-L102)

## Contrast with Worker-Thread Execution

The BaseService model contrasts with worker-thread execution, where services run in separate Node.js worker threads. While BaseService services share memory and the event loop, worker-thread services operate in isolated contexts with their own memory space and event loops.

Worker-thread services are better suited for CPU-intensive tasks that would otherwise block the main thread. However, they require message passing for inter-process communication and cannot directly access main-thread resources. The choice between models depends on the service's computational profile and resource requirements.

BaseService provides a simpler programming model with lower overhead for lightweight, I/O-bound operations, while worker threads offer superior isolation and performance for computationally intensive workloads.

```mermaid
graph TB
subgraph "Main Thread Model"
M1[ServiceManager]
M2[BaseService]
M3[Shared Memory]
M4[Single Event Loop]
end
subgraph "Worker Thread Model"
W1[ServiceManager]
W2[WorkerService]
W3[Isolated Memory]
W4[Separate Event Loop]
end
M1 --> M2
M2 --> M3
M2 --> M4
W1 --> W2
W2 --> W3
W2 --> W4
```

**Diagram sources**
- [BaseService.ts](file://src/BaseService.ts#L6-L25)
- [ServiceManager.ts](file://src/ServiceManager.ts#L79-L114)

**Section sources**
- [BaseService.ts](file://src/BaseService.ts#L6-L25)

## Custom Service Implementation Guide

To implement a custom service using BaseService, extend the class and provide implementations for the `start()` and `stop()` methods. The constructor should accept a name parameter and pass it to the superclass constructor.

In the `start()` method, initialize service resources and begin any ongoing operations. For long-running services, return a promise that resolves only when the service is stopped. The `stop()` method should clean up resources and resolve any pending operations.

Services can override the `healthCheck()` method to provide additional diagnostic information while relying on the ServiceManager to supply the authoritative status.

```mermaid
classDiagram
class CustomService {
+string name
-isRunning : boolean
-intervalId : Timeout
+start() : Promise~void~
+stop() : Promise~void~
+healthCheck() : Promise~HealthCheckResult~
}
CustomService --|> BaseService : extends
BaseService ..> IService : implements
```

**Diagram sources**
- [examples/rest-api.ts](file://examples/rest-api.ts#L18-L53)
- [examples/services/logService.ts](file://examples/services/logService.ts#L6-L42)

**Section sources**
- [examples/rest-api.ts](file://examples/rest-api.ts#L18-L53)

## Integration with ServiceManager

Services extending BaseService integrate with the ServiceManager through the `addService()` method. The ServiceManager maintains a registry of services and their configurations, including restart policies and cron job schedules.

When a service is added, the ServiceManager tracks its state and provides lifecycle management. The `startService()` and `stopService()` methods coordinate the execution of service lifecycle methods while maintaining consistent state tracking across all managed services.

The ServiceManager also provides health check aggregation through the `healthCheckAllServices()` method, which collects health information from all registered services while ensuring consistent status reporting.

```mermaid
sequenceDiagram
participant User
participant SM as ServiceManager
participant BS as BaseService
User->>SM : addService(service, config)
SM->>SM : Store service in map
SM->>SM : Apply config (cron, policy)
User->>SM : startService(name)
SM->>SM : Validate service exists
SM->>SM : Set status to "running"
SM->>BS : Call start()
BS-->>SM : Return Promise
SM->>SM : Monitor for errors
User->>SM : stopService(name)
SM->>BS : Call stop()
BS-->>SM : Resolve Promise
SM->>SM : Set status to "stopped"
```

**Diagram sources**
- [ServiceManager.ts](file://src/ServiceManager.ts#L30-L76)
- [BaseService.ts](file://src/BaseService.ts#L6-L25)

**Section sources**
- [ServiceManager.ts](file://src/ServiceManager.ts#L30-L76)