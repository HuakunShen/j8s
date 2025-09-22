import { Effect, Console } from "effect"
import { WorkerChildIO, RPCChannel } from "@kunkun/kkrpc"
import type { IEffectService } from "../services/interfaces"

/**
 * Expose an Effect-based service in a worker thread
 * This is the Effect equivalent of the original expose function
 */
export const exposeEffect = (service: IEffectService): Effect.Effect<never, never, never> => 
  Effect.gen(function* () {
    yield* Console.log(`Exposing Effect service '${service.name}' in worker thread`)
    
    // Create worker IO and RPC channel
    const io = new WorkerChildIO()
    const rpc = new RPCChannel(io, {
      expose: {
        name: service.name,
        start: () => Effect.runPromise(service.start),
        stop: () => Effect.runPromise(service.stop),
        healthCheck: () => Effect.runPromise(service.healthCheck)
      }
    })

    yield* Console.log(`Effect service '${service.name}' exposed and ready`)
    
    // Keep the worker alive
    yield* Effect.never
  }).pipe(
    Effect.catchAllCause((cause) =>
      Console.error("Error in Effect worker service:", cause).pipe(
        Effect.as(Effect.never)
      )
    )
  )

/**
 * Helper function to run exposeEffect
 */
export const runExposeEffect = (service: IEffectService): void => {
  Effect.runFork(exposeEffect(service))
}
