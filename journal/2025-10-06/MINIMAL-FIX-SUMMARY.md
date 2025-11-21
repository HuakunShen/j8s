# Minimal Fix Summary - Worker RPC Scheduling Issue

**Date**: 2025-10-05  
**Status**: ✅ Verified

## Problem

Worker services using `j8s` with `Effect` scheduling were only running once and not repeating as scheduled.

## Systematic Testing Results

I tested each change individually by reverting it and observing if services still worked:

| # | Change | Location | Necessary? | Test Result |
|---|--------|----------|------------|-------------|
| 1 | `autoTerminate: false` | `apps/services/src/run.ts` | ❌ NO | Services repeat with `autoTerminate: true` |
| 2 | Keep-alive interval | `packages/j8s/src/expose.ts` | ❌ NO | Services repeat without keep-alive |
| 3 | `adapter.stop()` after each run | `packages/j8s/src/ServiceManager.ts` | ✅ YES | Services DON'T repeat without this |
| 4 | Filter scheduled services from manual start | `packages/j8s/src/ServiceManager.ts` | ❌ NO | Services repeat without filtering |
| 5 | Web Worker API (vs Node.js worker_threads) | `packages/j8s/src/WorkerService.ts` | ✅ YES | Services DON'T repeat without this |

## The TRUE Minimal Fix

### Only 2 Changes Are Required:

#### 1. Use Web Worker API in `WorkerService.ts` (CRITICAL)

**Why**: `kkrpc` expects the web Worker API, not Node.js `worker_threads`. Bun provides the global `Worker` API that's compatible with web standards.

```typescript
// BEFORE (BROKEN)
import { Worker as NodeWorker } from "node:worker_threads";
this.worker = new NodeWorker(path, options);
this.worker.addListener("error", ...);

// AFTER (WORKS)
// @ts-ignore - Worker is a global in Bun
type WorkerType = Worker;
this.worker = new Worker(path, options);
this.worker.addEventListener("error", ...);
```

**Files Changed**:
- `packages/j8s/src/WorkerService.ts`

**Lines of Code**: ~10 lines

---

#### 2. Reset Adapter State After Each Scheduled Run (CRITICAL)

**Why**: The `IServiceAdapter` tracks a `started` flag. After the first run, `started = true`. When the scheduler tries to run again, `adapter.start()` returns early without executing. Calling `adapter.stop()` resets this flag.

```typescript
// In ServiceManager.setupScheduledJob()
const result = yield* Effect.either(timedServiceEffect);

// Reset adapter state after each scheduled run to allow next execution
// This is critical for scheduled jobs that need to run repeatedly
yield* Effect.promise(() => managedService.adapter.stop());
```

**Files Changed**:
- `packages/j8s/src/ServiceManager.ts` (add 3 lines)

**Lines of Code**: ~3 lines

---

## Changes That Were NOT Necessary

### 1. ❌ `autoTerminate: false` - NOT NEEDED

**Tested**: Reverted all `autoTerminate` back to `true` in `run.ts`  
**Result**: Services still repeat correctly  
**Reason**: With the web Worker API fix, workers can communicate properly even when `autoTerminate: true`

**Recommendation**: Keep `autoTerminate: true` (original setting)

---

### 2. ❌ Keep-Alive Interval - NOT NEEDED

**Tested**: Removed the `setInterval` keep-alive in `expose.ts`  
**Result**: Services still repeat correctly  
**Reason**: The web Worker API ensures workers stay alive long enough for RPC responses

**Recommendation**: Remove the keep-alive code

---

### 3. ❌ Filter Scheduled Services - NOT NEEDED

**Tested**: Removed the filtering logic that skips scheduled services in `startAllServicesEffect()`  
**Result**: Services still repeat correctly  
**Reason**: Calling `startServiceEffect()` on an already-running service is safe and idempotent

**Recommendation**: Simplify `startAllServicesEffect()` to start all services without filtering

---

## Root Cause Analysis

The original issue had **TWO** root causes:

### Root Cause #1: Wrong Worker API
`kkrpc` is designed for the **web Worker API** (standardized across browsers, Deno, Bun), not Node.js `worker_threads`. When using `node:worker_threads`:
- Event handling is different (`.addListener()` vs `.addEventListener()`)
- Message serialization might differ
- RPC message handling breaks silently

### Root Cause #2: Adapter State Not Reset
The `IServiceAdapter` has this logic:
```typescript
async start(): Promise<void> {
  if (this.started || this.startPromise) {
    return this.startPromise || Promise.resolve(); // Returns early!
  }
  // ... actual start logic
  this.started = true;
}
```

For one-time services, this is fine. But for **repeated scheduled jobs**, the adapter must be reset after each run, otherwise subsequent runs return early without executing.

---

## Recommended Actions

### Immediate Changes

1. ✅ Keep: Web Worker API in `WorkerService.ts`
2. ✅ Keep: `adapter.stop()` reset in `ServiceManager.ts`
3. ❌ Revert: All `autoTerminate: false` back to `autoTerminate: true` in `run.ts`
4. ❌ Remove: Keep-alive interval from `expose.ts`
5. ❌ Simplify: `startAllServicesEffect()` to not filter scheduled services

### Optional Future Improvements

1. **Better Adapter API**: Consider adding a `reset()` method to `IServiceAdapter` instead of calling `stop()` just to reset state.

2. **Documentation**: Add a comment in `IServiceAdapter` explaining why scheduled jobs need state reset.

3. **Type Safety**: Remove `as any` casts that hide Worker type mismatches:
   ```typescript
   // Before
   this.io = new WorkerParentIO(this.worker as any);
   
   // After (with proper types)
   this.io = new WorkerParentIO(this.worker);
   ```

---

## Test Evidence

All tests conducted with `bun run src/run.ts` for 60-65 seconds, observing:
- income-history-snapshot: Scheduled every 20s
- orders-history-snapshot: Scheduled every 20s  
- wallet-balance-history: Scheduled every 30s
- risk-control-cron: Scheduled every 30s

**Success Criteria**: Services must execute multiple times at their configured intervals.

### Test Results Summary

| Configuration | Result | Notes |
|--------------|--------|-------|
| All changes (original fix) | ✅ PASS | All services repeat |
| Revert autoTerminate to true | ✅ PASS | Still works! |
| Remove keep-alive | ✅ PASS | Still works! |
| Remove adapter.stop() reset | ❌ FAIL | Services run once only |
| Remove filtering | ✅ PASS | Still works! |
| Revert to Node worker_threads | ❌ FAIL | Services run once only |

---

## Conclusion

The bug required **only 2 changes** (~13 lines of code):

1. Switch from Node.js `worker_threads` to web Worker API  
2. Reset adapter state after each scheduled run

The other 3 changes were **defensive** but not necessary. They can be safely reverted to keep the codebase simpler and more maintainable.

**Production Ready**: ✅ Yes (with minimal changes only)

