# Agent Guidelines for j8s Repository

## Build/Test Commands

- **Type check**: `npm run check-types`
- **Format code**: `npm run format`
- **Run all tests**: `vitest` or `bun test`
- **Run single test**: `vitest cron-job.test.ts` or `bun test cron-job.test.ts`
- **Watch mode**: `vitest --watch` or `bun test --watch`

## Code Style

### TypeScript

- Use `type` imports: `import type { IService } from "./interface"`
- ES modules with `.ts` extensions
- Strict TypeScript enabled (noImplicitAny, strictNullChecks, etc.)
- Use `interface` for object shapes, `type` for unions/generics

### Formatting

- Prettier with trailing commas (ES5 style)
- 2-space indentation
- No semicolons (ESM style)

### Naming

- Classes: PascalCase (`ServiceManager`)
- Interfaces: PascalCase with `I` prefix (`IService`)
- Methods: camelCase (`addService`)
- Variables: camelCase (`serviceMap`)
- Constants: UPPER_SNAKE_CASE

### Error Handling

- Use `try/catch` blocks for async operations
- Console errors for service failures
- Throw `Error` objects with descriptive messages
- Handle Promise rejections with `Promise.allSettled` for bulk operations

### Patterns

- Abstract base classes for services
- Service manager pattern for lifecycle management
- Cron job support with timeout handling
- Health check patterns with status management
