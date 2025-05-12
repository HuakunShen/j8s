import { ServiceManager } from "../src/serviceManager"
import { fileURLToPath } from "url"
import path from "path"

async function main() {
  const serviceManager = new ServiceManager()

  // Get absolute path for the script
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const absoluteScriptPath = path.resolve(currentDir, "./logService.ts")
  
  // Example 1: Register a service using script path (traditional way)
  serviceManager.register({
    name: "localLoggingService",
    script: absoluteScriptPath,
    longRunning: true,
    restartPolicy: "always",
  })

  // Example 2: Register a service using a pre-created worker (new way)
  // This is useful for remote scripts or for more control over worker creation
  
  // Create a worker from a remote URL (or any Worker instance)
  // For demonstration purposes, we're using a local script as if it were remote
  const remoteWorker = new Worker(
    new URL("./logService.ts", import.meta.url).href,
    { type: "module" }
  )
  
  // Register the service with the pre-created worker
  serviceManager.register({
    name: "remoteLoggingService",
    worker: remoteWorker,
    longRunning: true,
    restartPolicy: "always",
  })

  // Start all services
  await serviceManager.startAll()
  console.log("All services started")
  
  // Get status of all services
  console.log("Services status:", serviceManager.status())
  
  // After a while, stop all services
  setTimeout(async () => {
    await serviceManager.stopAll()
    console.log("All services stopped")
  }, 10000)
}

main().catch(console.error) 