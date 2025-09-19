# J8S Service Manager Tests

This directory contains tests for the J8S service manager. The tests are written using Vitest.

## Running Tests

You can run the tests using the following commands:

```bash
# Run all tests
bun test

# Run specific test files
bun test:restart  # For restart policy tests
bun test:cron     # For cron job tests

# Run tests in watch mode
bun test:watch
```

## Test Files

- **restart-policy.test.ts**: Tests for the ServiceManager's restart policies and maximum retry functionality
- **cron-job.test.ts**: Tests for the ServiceManager's cron job scheduling functionality

## Test Approach

### Restart Policy Tests

The restart policy suite uses Effect-based mock services to validate different behaviours:

1. **`"no"` policy** – ensure services are not restarted after a crash
2. **`"on-failure"` with `maxRetries`** – verify exponential back-off limits restart attempts
3. **Restart counter reset** – confirm the counter resets after a successful run
4. **Short-lived services** – immediate completions should not be treated as startup failures
5. **`"always"` policy** – successful completions trigger an automatic restart

Each assertion uses `Effect.runPromise`, so the tests execute the same code paths as production consumers.

### Cron Job Tests

Cron tests focus on registration, removal and manual stopping of scheduled services. They use a lightweight Effect service that simply counts `start`/`stop` invocations.
