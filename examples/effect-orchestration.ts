/**
 * Effect-based Service Orchestration
 *
 * This example demonstrates sophisticated service orchestration patterns using Effect:
 * - Service pipelines and workflows
 * - Event-driven service coordination
 * - Service composition with Effect layers
 * - Real-world microservice patterns
 */

import { Effect, Stream, Ref, Layer, Context, Schedule, Duration } from "effect";
import { BaseService, ServiceManager } from "../index";
import type { HealthCheckResult } from "../index";

// Event system for service coordination
interface ServiceEvent {
  type: "started" | "stopped" | "error" | "health_check";
  serviceName: string;
  timestamp: Date;
  data?: any;
}

class EventEmitter {
  private subscribers: Map<string, Array<(event: ServiceEvent) => void>> = new Map();

  emit(event: ServiceEvent): void {
    const listeners = this.subscribers.get(event.type) || [];
    listeners.forEach(listener => listener(event));
  }

  on(eventType: string, listener: (event: ServiceEvent) => void): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType)!.push(listener);
  }
}

// Enhanced service with event emission
class EventAwareService extends BaseService {
  private isRunning = false;

  constructor(name: string, private emitter: EventEmitter) {
    super(name);
  }

  async start(): Promise<void> {
    console.log(`🚀 Starting ${this.name}...`);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    this.isRunning = true;
    this.emitter.emit({
      type: "started",
      serviceName: this.name,
      timestamp: new Date(),
    });
    console.log(`✅ ${this.name} started`);
  }

  async stop(): Promise<void> {
    console.log(`🛑 Stopping ${this.name}...`);
    await new Promise(resolve => setTimeout(resolve, 300));
    this.isRunning = false;
    this.emitter.emit({
      type: "stopped",
      serviceName: this.name,
      timestamp: new Date(),
    });
    console.log(`🛑 ${this.name} stopped`);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const health: HealthCheckResult = {
      status: this.isRunning ? "running" : "stopped",
      details: {
        timestamp: new Date().toISOString(),
        uptime: this.isRunning ? Date.now() : 0,
      },
    };

    this.emitter.emit({
      type: "health_check",
      serviceName: this.name,
      timestamp: new Date(),
      data: health,
    });

    return health;
  }
}

// Service that reacts to events from other services
class ReactiveService extends EventAwareService {
  private dependencies: Set<string> = new Set();
  private startedDependencies: Set<string> = new Set();

  constructor(name: string, emitter: EventEmitter, dependencies: string[] = []) {
    super(name, emitter);
    this.dependencies = new Set(dependencies);

    // Listen to dependency events
    emitter.on("started", (event) => {
      if (this.dependencies.has(event.serviceName)) {
        this.startedDependencies.add(event.serviceName);
        console.log(`📡 ${this.name} detected ${event.serviceName} started`);
      }
    });

    emitter.on("stopped", (event) => {
      if (this.dependencies.has(event.serviceName)) {
        this.startedDependencies.delete(event.serviceName);
        console.log(`📡 ${this.name} detected ${event.serviceName} stopped`);
      }
    });
  }

  async start(): Promise<void> {
    // Check if all dependencies are running
    if (this.dependencies.size > 0 && this.startedDependencies.size !== this.dependencies.size) {
      const missing = Array.from(this.dependencies).filter(dep => !this.startedDependencies.has(dep));
      throw new Error(`${this.name} cannot start: missing dependencies: ${missing.join(", ")}`);
    }

    await super.start();
  }

  getDependencies(): string[] {
    return Array.from(this.dependencies);
  }
}

// Example 1: Service Pipeline
async function servicePipelineExample() {
  console.log("🎯 Service Pipeline Example\n");

  const serviceManager = new ServiceManager();
  const emitter = new EventEmitter();

  // Create a pipeline of services
  const dataIngestion = new EventAwareService("data-ingestion", emitter);
  const dataProcessing = new ReactiveService("data-processing", emitter, ["data-ingestion"]);
  const dataStorage = new ReactiveService("data-storage", emitter, ["data-processing"]);
  const api = new ReactiveService("api", emitter, ["data-storage"]);

  [dataIngestion, dataProcessing, dataStorage, api].forEach(service => {
    serviceManager.addService(service);
  });

  const program = Effect.gen(function* () {
    console.log("🏗️  Setting up service pipeline...");

    // Start services in dependency order using Effect composition
    const startPipeline = Effect.gen(function* () {
      console.log("1️⃣ Starting data ingestion...");
      yield* serviceManager.startServiceEffect("data-ingestion");

      console.log("2️⃣ Starting data processing...");
      yield* serviceManager.startServiceEffect("data-processing");

      console.log("3️⃣ Starting data storage...");
      yield* serviceManager.startServiceEffect("data-storage");

      console.log("4️⃣ Starting API...");
      yield* serviceManager.startServiceEffect("api");

      return "Pipeline started successfully";
    });

    const result = yield* startPipeline;
    console.log(`✅ ${result}`);

    // Health check the entire pipeline
    console.log("\n🔍 Checking pipeline health...");
    const health = yield* serviceManager.healthCheckAllServicesEffect();

    console.log("📊 Pipeline Status:");
    ["data-ingestion", "data-processing", "data-storage", "api"].forEach(name => {
      console.log(`   ${name}: ${health[name]?.status}`);
    });

    return "Pipeline example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Pipeline example failed:", error);
  } finally {
    await serviceManager.stopAllServices();
  }
}

// Example 2: Event-driven coordination
async function eventDrivenExample() {
  console.log("\n\n🎯 Event-Driven Coordination Example\n");

  const serviceManager = new ServiceManager();
  const emitter = new EventEmitter();

  // Set up event logging
  emitter.on("started", (event) => {
    console.log(`📢 EVENT: ${event.serviceName} started at ${event.timestamp.toISOString()}`);
  });

  emitter.on("stopped", (event) => {
    console.log(`📢 EVENT: ${event.serviceName} stopped at ${event.timestamp.toISOString()}`);
  });

  // Create services with complex dependencies
  const auth = new EventAwareService("auth-service", emitter);
  const userDb = new ReactiveService("user-database", emitter, ["auth-service"]);
  const userApi = new ReactiveService("user-api", emitter, ["auth-service", "user-database"]);
  const notification = new ReactiveService("notification-service", emitter, ["user-api"]);

  [auth, userDb, userApi, notification].forEach(service => {
    serviceManager.addService(service);
  });

  const program = Effect.gen(function* () {
    console.log("🎭 Starting event-driven service coordination...");

    // Start services with automatic dependency resolution
    const services = ["auth-service", "user-database", "user-api", "notification-service"];

    // Use Effect.forEach to start services with proper error handling
    yield* Effect.forEach(services, (serviceName) =>
      Effect.retry(
        serviceManager.startServiceEffect(serviceName),
        Schedule.exponential("100 millis").pipe(Schedule.intersect(Schedule.recurs(3)))
      )
    );

    console.log("\n✅ All services started through event coordination");

    // Simulate a service failure and recovery
    console.log("\n🔧 Simulating auth-service restart...");
    yield* serviceManager.stopServiceEffect("auth-service");

    // Wait a bit
    yield* Effect.sleep(Duration.seconds(1));

    yield* serviceManager.startServiceEffect("auth-service");
    console.log("✅ Auth service restarted");

    return "Event-driven example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Event-driven example failed:", error);
  } finally {
    await serviceManager.stopAllServices();
  }
}

// Example 3: Service composition with Effect streams
async function streamOrchestrationExample() {
  console.log("\n\n🎯 Stream-based Service Orchestration Example\n");

  const serviceManager = new ServiceManager();
  const emitter = new EventEmitter();

  // Create services
  const services = Array.from({ length: 5 }, (_, i) =>
    new EventAwareService(`worker-${i + 1}`, emitter)
  );

  services.forEach(service => serviceManager.addService(service));

  const program = Effect.gen(function* () {
    console.log("🌊 Creating service startup stream...");

    // Create a stream of service startup operations
    const serviceNames = services.map(s => s.name);
    const startupStream = Stream.fromIterable(serviceNames).pipe(
      Stream.mapEffect((serviceName) =>
        Effect.gen(function* () {
          console.log(`🚀 Starting ${serviceName}...`);
          yield* serviceManager.startServiceEffect(serviceName);
          return `${serviceName} started`;
        })
      ),
      Stream.tap((result) => Effect.sync(() => console.log(`✅ ${result}`))),
      // Add backpressure - only start 2 services concurrently
      Stream.buffer({ capacity: 2 })
    );

    // Run the stream
    yield* Stream.runDrain(startupStream);
    console.log("\n🎉 All services started via stream orchestration");

    // Create a health monitoring stream
    console.log("\n🔍 Starting health monitoring stream...");
    const healthMonitoringStream = Stream.fromSchedule(Schedule.spaced(Duration.seconds(2))).pipe(
      Stream.mapEffect(() =>
        Effect.gen(function* () {
          const health = yield* serviceManager.healthCheckAllServicesEffect();
          const runningCount = Object.values(health).filter(h => h.status === "running").length;
          console.log(`📊 Health check: ${runningCount}/${services.length} services running`);
          return runningCount;
        })
      ),
      Stream.take(3) // Only do 3 health checks
    );

    yield* Stream.runDrain(healthMonitoringStream);

    return "Stream orchestration completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Stream orchestration failed:", error);
  } finally {
    await serviceManager.stopAllServices();
  }
}

// Example 4: Microservice architecture pattern
async function microserviceArchitectureExample() {
  console.log("\n\n🎯 Microservice Architecture Example\n");

  const serviceManager = new ServiceManager();
  const emitter = new EventEmitter();

  // Gateway service that depends on all others
  class GatewayService extends ReactiveService {
    private routes: Map<string, string> = new Map();

    constructor(emitter: EventEmitter, backends: string[]) {
      super("api-gateway", emitter, backends);

      // Set up routing
      backends.forEach(service => {
        this.routes.set(`/${service}`, service);
      });
    }

    async start(): Promise<void> {
      await super.start();
      console.log(`🌐 Gateway routing: ${Array.from(this.routes.entries()).map(([path, service]) => `${path} -> ${service}`).join(", ")}`);
    }

    getRoutes(): Map<string, string> {
      return this.routes;
    }
  }

  // Create microservices
  const userService = new EventAwareService("user-service", emitter);
  const orderService = new EventAwareService("order-service", emitter);
  const inventoryService = new EventAwareService("inventory-service", emitter);
  const paymentService = new EventAwareService("payment-service", emitter);

  const gateway = new GatewayService(emitter, [
    "user-service", "order-service", "inventory-service", "payment-service"
  ]);

  [userService, orderService, inventoryService, paymentService, gateway].forEach(service => {
    serviceManager.addService(service);
  });

  const program = Effect.gen(function* () {
    console.log("🏢 Starting microservice architecture...");

    // Start backend services concurrently
    const backendServices = ["user-service", "order-service", "inventory-service", "payment-service"];
    console.log("🚀 Starting backend services concurrently...");

    const startBackends = Effect.all(
      backendServices.map(name => serviceManager.startServiceEffect(name)),
      { concurrency: "unbounded" }
    );

    yield* startBackends;
    console.log("✅ All backend services started");

    // Start gateway after backends are ready
    console.log("🌐 Starting API gateway...");
    yield* serviceManager.startServiceEffect("api-gateway");

    // Verify the entire architecture
    console.log("\n🔍 Verifying microservice architecture...");
    const health = yield* serviceManager.healthCheckAllServicesEffect();

    console.log("📊 Microservice Status:");
    Object.entries(health).forEach(([name, health]) => {
      const status = health.status === "running" ? "🟢" : "🔴";
      console.log(`   ${status} ${name}: ${health.status}`);
    });

    // Simulate a service failure and system resilience
    console.log("\n🔧 Testing system resilience - stopping user-service...");
    yield* serviceManager.stopServiceEffect("user-service");

    // Check system health after failure
    const healthAfterFailure = yield* serviceManager.healthCheckAllServicesEffect();
    const runningServices = Object.values(healthAfterFailure).filter(h => h.status === "running").length;
    const totalServices = Object.keys(healthAfterFailure).length;

    console.log(`📊 System resilience: ${runningServices}/${totalServices} services still running`);

    return "Microservice architecture example completed";
  });

  try {
    const result = await Effect.runPromise(program);
    console.log(result);
  } catch (error) {
    console.error("❌ Microservice architecture example failed:", error);
  } finally {
    await serviceManager.stopAllServices();
  }
}

// Main execution
if (import.meta.main) {
  await servicePipelineExample();
  await eventDrivenExample();
  await streamOrchestrationExample();
  await microserviceArchitectureExample();
}

export {
  servicePipelineExample,
  eventDrivenExample,
  streamOrchestrationExample,
  microserviceArchitectureExample,
};