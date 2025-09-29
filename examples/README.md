# j8s Effect Integration Examples

This directory contains comprehensive examples demonstrating how j8s works seamlessly with Effect, a powerful TypeScript library for building robust, type-safe applications with functional programming patterns.

## 🌟 Why Effect + j8s?

j8s provides both Promise-based and Effect-based APIs for all service operations, allowing you to leverage Effect's powerful features:

- **Type Safety**: Full type safety with Effect's error handling
- **Composability**: Combine service operations using Effect's composition operators
- **Concurrency**: Built-in concurrent execution with proper resource management
- **Retry Logic**: Sophisticated retry strategies with schedules
- **Resource Management**: Automatic cleanup with scoped resources
- **Streaming**: Process service operations as streams
- **Error Handling**: Structured error handling with Effect's Either type

## 📁 Examples Overview

### 1. [`basic-effect-service.ts`](./basic-effect-service.ts)
**Getting Started with Effect + j8s**

Learn the fundamentals of using j8s with Effect:
- Basic service creation and management
- Effect-based service operations (`startServiceEffect`, `stopServiceEffect`, etc.)
- Health checking with Effects
- Error handling with `Effect.either`
- Simple service orchestration

```bash
bun run examples/basic-effect-service.ts
```

**Key Concepts Covered:**
- `Effect.gen` for sequential operations
- `Effect.runPromise` to execute Effect programs
- Error handling with Effect's type system
- Service lifecycle management

### 2. [`advanced-effect-patterns.ts`](./advanced-effect-patterns.ts)
**Advanced Effect Patterns**

Explore sophisticated patterns for production-ready service management:
- Retry logic with exponential backoff
- Timeout handling for long-running operations
- Concurrent service operations
- Resource management with automatic cleanup
- Service dependency handling

```bash
bun run examples/advanced-effect-patterns.ts
```

**Key Concepts Covered:**
- `Schedule.exponential` for retry strategies
- `Effect.timeout` for operation timeouts
- `Effect.all` for concurrent execution
- `Effect.scoped` for resource management
- `Effect.acquireRelease` for cleanup patterns

### 3. [`effect-orchestration.ts`](./effect-orchestration.ts)
**Service Orchestration at Scale**

Demonstrates enterprise-grade service orchestration patterns:
- Service pipelines and workflows
- Event-driven service coordination
- Stream-based service processing
- Microservice architecture patterns
- System resilience and fault tolerance

```bash
bun run examples/effect-orchestration.ts
```

**Key Concepts Covered:**
- `Stream.fromIterable` for service processing streams
- Event-driven architecture with reactive services
- Complex dependency management
- Microservice gateway patterns
- System health monitoring

## 🚀 Running the Examples

### Prerequisites
Make sure you have Effect installed (it's already included as a dependency in j8s):

```bash
cd packages/j8s
bun install
```

### Run Individual Examples

```bash
# Basic Effect integration
bun run examples/basic-effect-service.ts

# Advanced patterns
bun run examples/advanced-effect-patterns.ts

# Full orchestration
bun run examples/effect-orchestration.ts
```

### Run All Examples
```bash
# From the j8s package directory
bun run examples/basic-effect-service.ts && \
bun run examples/advanced-effect-patterns.ts && \
bun run examples/effect-orchestration.ts
```

## 🎯 Key j8s Effect APIs

j8s provides Effect-based versions of all service management operations:

### Service Management
```typescript
// Promise-based (traditional)
await serviceManager.startService("my-service");

// Effect-based (functional)
yield* serviceManager.startServiceEffect("my-service");
```

### Available Effect Methods
- `startServiceEffect(name: string): Effect<void, Error>`
- `stopServiceEffect(name: string): Effect<void, Error>`
- `healthCheckServiceEffect(name: string): Effect<HealthCheckResult, Error>`
- `startAllServicesEffect(): Effect<void, Error>`
- `stopAllServicesEffect(): Effect<void, Error>`
- `healthCheckAllServicesEffect(): Effect<Record<string, HealthCheckResult>, Error>`

### Composition Examples

**Sequential Operations:**
```typescript
const program = Effect.gen(function* () {
  yield* serviceManager.startServiceEffect("database");
  yield* serviceManager.startServiceEffect("api");
  const health = yield* serviceManager.healthCheckServiceEffect("api");
  return health;
});
```

**Concurrent Operations:**
```typescript
const startAll = Effect.all([
  serviceManager.startServiceEffect("service-1"),
  serviceManager.startServiceEffect("service-2"),
  serviceManager.startServiceEffect("service-3"),
], { concurrency: "unbounded" });
```

**Error Handling:**
```typescript
const result = yield* Effect.either(
  serviceManager.startServiceEffect("unreliable-service")
);

if (result._tag === "Left") {
  console.log("Service failed:", result.left.message);
} else {
  console.log("Service started successfully");
}
```

**Retry with Schedule:**
```typescript
const withRetry = Effect.retry(
  serviceManager.startServiceEffect("flaky-service"),
  Schedule.exponential("100 millis").pipe(
    Schedule.intersect(Schedule.recurs(5))
  )
);
```

## 🛠️ Creating Your Own Effect Services

### Basic Service with Effect
```typescript
import { Effect } from "effect";
import { BaseService } from "j8s";

class MyEffectService extends BaseService {
  async start(): Promise<void> {
    // Your service startup logic
  }

  async stop(): Promise<void> {
    // Your service cleanup logic
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return { status: "running" };
  }
}

// Use with Effect
const program = Effect.gen(function* () {
  const manager = new ServiceManager();
  const service = new MyEffectService("my-service");

  manager.addService(service);
  yield* manager.startServiceEffect("my-service");

  return "Service started!";
});

await Effect.runPromise(program);
```

### Advanced Effect Patterns
```typescript
// Service with Effect-based operations
class AdvancedService extends BaseService {
  // Create Effect-based business logic
  private processData = Effect.gen(function* () {
    // Your Effect-based data processing
    yield* Effect.sleep(Duration.seconds(1));
    return "Data processed";
  });

  async start(): Promise<void> {
    // You can still use Effect internally
    const result = await Effect.runPromise(this.processData);
    console.log(result);
  }
}
```

## 📚 Additional Resources

- [Effect Documentation](https://effect.website/)
- [j8s Core Documentation](../README.md)
- [Effect GitHub Repository](https://github.com/Effect-TS/effect)

## 🤝 Contributing

Found an issue or want to add more examples? Contributions are welcome! Please ensure examples:

1. Are well-documented with clear explanations
2. Demonstrate practical, real-world patterns
3. Include proper error handling
4. Follow Effect best practices
5. Are runnable with `bun run`

## 📝 License

These examples are part of the j8s project and follow the same license terms.