# j8s

## 0.2.0

### Major Changes

- **Effect Integration**: Complete refactor to integrate [effect-ts](https://github.com/Effect-TS/effect) library into j8s core, providing enhanced reliability, structured concurrency, and robust error handling
- **Hybrid Architecture**: Introduced adapter pattern that combines familiar class-based `IService` interface with Effect-powered service management APIs
- **Enhanced Service Management**: Added Effect-based APIs for service orchestration with automatic resource management and sophisticated retry policies

### New Features

- **EffectUtils**: New utility module for Effect-powered service lifecycle management
- **EnhancedServiceAdapter**: Bridge between class-based services and Effect-based management
- **EnhancedServiceManager**: Effect-enhanced service manager with improved error handling and retry strategies
- **IEffectService**: Interface for Effect-based service implementations
- **Comprehensive Testing**: Added extensive test coverage for Effect integration, edge cases, and service lifecycle management

### Improvements

- **Backward Compatibility**: Existing service code continues to work without changes
- **Better Error Handling**: Sophisticated retry policies and error recovery strategies
- **Automatic Resource Management**: Guaranteed cleanup when services are stopped or crash
- **Performance**: Traditional Promise-based service execution with Effect orchestration

### Breaking Changes

- **API Changes**: Internal refactoring of service management APIs to use Effect patterns
- **Dependencies**: Added `effect` as a core dependency (version ^3.17.14)

### Documentation

- **Updated README**: Comprehensive documentation of the new Effect-powered architecture and hybrid approach
- **Examples**: New example files demonstrating Effect integration patterns and advanced use cases

## 0.1.5

### Patch Changes

- Migrate worker from Bun worker to node worker thread

## 0.1.0

### Minor Changes

- Basic features ready, including a web server with APIs to control the service manager and a simple web UI.
