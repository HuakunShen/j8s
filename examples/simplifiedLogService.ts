import { type IService, ServiceWorker } from "..";

// Create a service implementation
class LoggingService implements IService {
  name = "loggingService";

  async start(): Promise<void> {
    console.log("loggingService started");
    let count = 0;
    setInterval(() => {
      console.log("loggingService log", count++);
    }, 1000);
  }

  async stop(): Promise<void> {
    console.log("loggingService stopped");
  }
}

// Initialize the worker - this is all users need to do!
// No direct dependency on kkrpc is needed
new ServiceWorker(new LoggingService());
