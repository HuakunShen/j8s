# j8s Effect-Based Architecture 🚀

A production-ready service framework built with Effect.js, providing type safety, structured concurrency, and enterprise-grade features.

## ✨ Key Features

### 🏗️ Core Architecture

- **Effect-Based Services**: Type-safe async operations with proper error handling
- **Structured Concurrency**: Built-in resource management and cleanup
- **Service Lifecycle**: Comprehensive start/stop/health management
- **Graceful Shutdown**: Proper resource cleanup and state management

### 🔄 Retry & Resilience

- **Configurable Retry Policies**: Exponential, linear, fixed, and custom strategies
- **Rate Limiting**: Built-in rate limiting to prevent overwhelming services
- **Circuit Breakers**: Automatic failover and recovery
- **Timeout Management**: Configurable timeouts for all operations

### 🌐 Service Discovery

- **Multi-Instance Support**: Run multiple instances of the same service
- **Load Balancing**: Round-robin, random, weighted, and health-based strategies
- **Service Registry**: Automatic registration and discovery of instances
- **Health Monitoring**: Real-time health checks with automatic failover

### 📊 Observability

- **Structured Logging**: Consistent, searchable log format with metadata
- **Health Monitoring**: Built-in health check system with statistics
- **Performance Metrics**: Comprehensive monitoring and alerting
- **Tracing Ready**: Pre-integrated for OpenTelemetry support

### 👷 Worker Services

- **Effect-Based Workers**: Type-safe worker thread management
- **RPC Communication**: Reliable inter-thread communication
- **Auto-Termination**: Configurable worker lifecycle management
- **Error Handling**: Comprehensive worker error recovery

## 🚀 Quick Start

### Installation

```bash
npm install effect @effect/schema
```

### Basic Service

```typescript
import { EffectBaseService } from "./effect-src";

class MyService extends EffectBaseService {
  protected doStart(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log("Service starting...");
    });
  }

  protected doStop(): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log("Service stopping...");
    });
  }

  protected doHealthCheck(): Effect.Effect<HealthCheckResult> {
    return Effect.sync(() => ({
      status: "healthy",
      timestamp: Date.now(),
      details: {},
    }));
  }
}

// Usage
const service = new MyService();
await Effect.runPromise(service.start());
const health = await Effect.runPromise(service.healthCheck());
await Effect.runPromise(service.stop());
```

### Service Manager

```typescript
import { EffectServiceManager } from "./effect-src";

const manager = new EffectServiceManager();
await Effect.runPromise(manager.addService(service));
await Effect.runPromise(manager.startAllServices());
const health = await Effect.runPromise(manager.healthCheckAllServices());
```

### Service Discovery & Load Balancing

```typescript
import { ServiceRegistry, ServiceInstanceFactory } from "./effect-src";

const registry = new ServiceRegistry();

// Register multiple instances
const instance1 = ServiceInstanceFactory.create(
  "api-service",
  "localhost:3001"
);
const instance2 = ServiceInstanceFactory.create(
  "api-service",
  "localhost:3002",
  { weight: 2 }
);

await Effect.runPromise(registry.register(instance1));
await Effect.runPromise(registry.register(instance2));

// Load balanced requests
const selected = await Effect.runPromise(registry.getInstance("api-service"));
```

### Retry Policies

```typescript
import { retryExponential } from "./effect-src";

const result = await Effect.runPromise(
  retryExponential(
    Effect.sync(() => riskyOperation()),
    3, // max retries
    1000 // base delay
  )
);
```

## 📋 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Effect-Based j8s Architecture                │
├─────────────────────────────────────────────────────────────┤
│  Application Layer                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Service   │  │   Service   │  │   Service   │          │
│  │     A      │  │     B      │  │     C      │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│  Service Management Layer                                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │         EffectServiceManager                               │ │
│  │  • Service lifecycle management                           │ │
│  │  • Health monitoring                                       │ │
│  │  • Error handling                                          │ │
│  │  • Retry policies                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Service Discovery & Load Balancing                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           ServiceRegistry                                  │ │
│  │  • Multi-instance support                                │ │
│  │  • Load balancing strategies                               │ │
│  │  • Health-based routing                                   │ │
│  │  • Service statistics                                       │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Individual Services                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │ EffectBaseService│  │EffectWorkerService│  │   Custom Service│    │
│  │                 │  │                 │  │                 │    │
│  │ • doStart()     │  │ • Worker mgmt   │  │ • Business     │    │
│  │ • doStop()      │  │ • RPC calls     │  │   logic        │    │
│  │ • doHealthCheck()│  │ • Lifecycle    │  │                 │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure & Utilities                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │   Retry Utils   │  │  Logging Utils │  │ Health Checker │    │
│  │                 │  │                 │  │                 │    │
│  │ • Exponential  │  │ • Structured    │  │ • Status checks│    │
│  │ • Linear       │  │   logging      │  │ • Metrics      │    │
│  │ • Fixed        │  │ • Metadata     │  │ • Alerting     │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Advanced Usage

### Custom Retry Strategy

```typescript
import { Schedule, Effect } from "effect";

const customRetry = <T>(effect: Effect.Effect<T>, maxRetries: number) => {
  const schedule = Schedule.recurs(maxRetries);
  return Effect.retry(effect, schedule);
};
```

### Health Check with Custom Metrics

```typescript
protected doHealthCheck(): Effect.Effect<HealthCheckResult> {
  return Effect.gen(() => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      status: memoryUsage.heapUsed < 100 * 1024 * 1024 ? "healthy" : "degraded",
      timestamp: Date.now(),
      details: {
        memory: memoryUsage,
        cpu: cpuUsage,
        uptime: process.uptime()
      }
    };
  });
}
```

### Multi-Region Service Discovery

```typescript
const usEastInstances = [
  ServiceInstanceFactory.create("api-service", "us-east-1.example.com"),
  ServiceInstanceFactory.create("api-service", "us-east-2.example.com"),
];

const euWestInstances = [
  ServiceInstanceFactory.create("api-service", "eu-west-1.example.com"),
];

// Register all instances
for (const instance of [...usEastInstances, ...euWestInstances]) {
  await Effect.runPromise(registry.register(instance));
}

// Get region-specific instance
const selected = await Effect.runPromise(registry.getInstance("api-service"));
```

## 📊 Performance & Monitoring

### Built-in Metrics

- **Service Health**: Real-time health status for all services
- **Instance Statistics**: Total instances, healthy instances, response times
- **Load Balancing Metrics**: Request distribution, error rates
- **Resource Usage**: Memory, CPU, and custom metrics

### Monitoring Integration

```typescript
// Custom health check with metrics
protected doHealthCheck(): Effect.Effect<HealthCheckResult> {
  return Effect.gen(() => {
    const startTime = Date.now();

    // Perform health check
    const isHealthy = await this.checkHealth();

    const responseTime = Date.now() - startTime;

    return {
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: Date.now(),
      details: {
        responseTime,
        customMetrics: await this.getCustomMetrics()
      }
    };
  });
}
```

## 🛠️ Development

### Project Structure

```
effect-src/
├── types.ts              # Core type definitions
├── BaseService.ts        # Abstract service base class
├── ServiceManager.ts     # Service lifecycle management
├── discovery.ts          # Service discovery & load balancing
├── WorkerService.ts      # Worker service management
├── retry.ts             # Retry policies & strategies
├── logging.ts           # Logging utilities
└── index.ts             # Main exports
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- discovery.test.ts

# Run with coverage
npm run test:coverage
```

### Building

```bash
# Build TypeScript
npm run build

# Build for production
npm run build:prod
```

## 📈 Production Deployment

### Configuration

```typescript
// config/services.ts
export const serviceConfig = {
  retry: {
    maxRetries: 3,
    schedule: "exponential",
    baseDelay: 1000,
    maxDelay: 30000,
  },
  healthCheck: {
    interval: 30000,
    timeout: 5000,
    retries: 2,
  },
  logging: {
    level: "info",
    structured: true,
    metadata: true,
  },
  discovery: {
    strategy: "weighted",
    healthCheckInterval: 10000,
  },
};
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist
COPY effect-src/ ./effect-src

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-service
  template:
    metadata:
      labels:
        app: my-service
    spec:
      containers:
        - name: my-service
          image: my-service:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit your changes: `git commit -m 'Add new feature'`
4. Push to the branch: `git push origin feature/new-feature`
5. Open a Pull Request

### Development Setup

```bash
# Clone repository
git clone <repository-url>
cd j8s

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test
```

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- [Effect.js](https://effect.website/) - For providing an excellent functional programming library
- [TypeScript](https://www.typescriptlang.org/) - For enabling type-safe JavaScript development
- [Node.js](https://nodejs.org/) - For the excellent runtime environment
- [Docker](https://www.docker.com/) - For containerization support
- [Kubernetes](https://kubernetes.io/) - For orchestration and scaling capabilities

---

**Built with ❤️ using Effect.js and TypeScript**
