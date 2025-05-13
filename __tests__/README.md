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

The restart policy tests use a `MockService` class that can be configured to fail a set number of times before succeeding. This allows us to test different restart behaviors:

1. **No restart policy**: Services should not be restarted when they fail
2. **Max retries**: Services should be restarted up to the maximum number of retries when using the "on-failure" policy
3. **Restart count reset**: The restart count should be reset after a successful start

To facilitate testing without timers, a `TestServiceManager` class is used to directly trigger service restarts.

### Cron Job Tests

The cron job tests verify that:

1. Services can be added with cron configuration
2. Cron jobs are properly managed when services are stopped
3. Cron jobs are removed when services are removed

These tests focus on the integration between the ServiceManager and the cron module, ensuring that cron jobs are properly created, started, and stopped.
