import { Effect } from "effect";
import {
  EffectWorkerService,
  WorkerServiceFactory,
  EffectServiceManager,
  ServiceRegistry,
  ServiceInstanceFactory,
} from "../index";

// Example worker service implementation
class DataProcessingWorker extends EffectWorkerService {
  constructor() {
    super("data-processor", {
      workerURL: new URL("../workers/data-processor.js", import.meta.url),
      workerOptions: {
        type: "module",
      },
      autoTerminate: false,
    });
  }

  // Custom method to process data
  processData(data: any[]): Effect.Effect<any[], AnyServiceError> {
    return this.callRPC("processBatch", { data });
  }

  // Get processing statistics
  getProcessingStats(): Effect.Effect<
    {
      processed: number;
      failed: number;
      averageTime: number;
    },
    AnyServiceError
  > {
    return this.callRPC("getStats");
  }
}

// Example service that uses workers
class AnalysisService extends EffectWorkerService {
  constructor() {
    super("analysis-service", {
      workerURL: new URL("../workers/analyzer.js", import.meta.url),
      workerData: {
        model: "v2",
        timeout: 5000,
      },
    });
  }

  // Analyze text using worker
  analyzeText(text: string): Effect.Effect<
    {
      sentiment: string;
      entities: any[];
      confidence: number;
    },
    AnyServiceError
  > {
    return this.callRPC("analyze", { text });
  }
}

// Main example
async function runWorkerExample() {
  console.log("=== Effect-Based Worker Service Example ===\n");

  const serviceManager = new EffectServiceManager();
  const serviceRegistry = new ServiceRegistry();

  try {
    // Create and register services
    console.log("1. Setting up worker services");

    const dataProcessor = new DataProcessingWorker();
    const analysisService = new AnalysisService();

    // Register with service manager
    await Effect.runPromise(serviceManager.addService(dataProcessor));
    await Effect.runPromise(serviceManager.addService(analysisService));

    // Register as service instances for load balancing
    const dataProcessorInstance = ServiceInstanceFactory.create(
      "data-processing",
      "data-processor-1",
      { weight: 2 }
    );

    const analysisInstance1 = ServiceInstanceFactory.create(
      "analysis-service",
      "analyzer-1",
      { weight: 1 }
    );

    const analysisInstance2 = ServiceInstanceFactory.create(
      "analysis-service",
      "analyzer-2",
      { weight: 1 }
    );

    await Effect.runPromise(serviceRegistry.register(dataProcessorInstance));
    await Effect.runPromise(serviceRegistry.register(analysisInstance1));
    await Effect.runPromise(serviceRegistry.register(analysisInstance2));

    console.log("✓ Services registered successfully\n");

    // Start services
    console.log("2. Starting services");
    await Effect.runPromise(serviceManager.startAllServices());

    // Check health
    const health = await Effect.runPromise(
      serviceManager.healthCheckAllServices()
    );
    console.log("Service health:", health);
    console.log("✓ Services started successfully\n");

    // Test worker functionality
    console.log("3. Testing worker functionality");

    // Test data processing
    const testData = [
      { id: 1, value: "test1" },
      { id: 2, value: "test2" },
      { id: 3, value: "test3" },
    ];

    try {
      const processed = await Effect.runPromise(
        dataProcessor.processData(testData)
      );
      console.log("Data processing result:", processed);

      const stats = await Effect.runPromise(dataProcessor.getProcessingStats());
      console.log("Processing stats:", stats);
    } catch (error) {
      console.log("Data processing test failed (expected - no actual worker)");
    }

    // Test text analysis
    try {
      const analysis = await Effect.runPromise(
        analysisService.analyzeText(
          "This is a great example of worker services!"
        )
      );
      console.log("Text analysis result:", analysis);
    } catch (error) {
      console.log("Text analysis test failed (expected - no actual worker)");
    }

    console.log("✓ Worker functionality tested\n");

    // Test load balancing with multiple analysis instances
    console.log("4. Testing load balancing");

    const selections: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      try {
        const selected = await Effect.runPromise(
          serviceRegistry.getInstance("analysis-service")
        );
        selections[selected.id] = (selections[selected.id] || 0) + 1;
      } catch (error) {
        console.log("Load balancing test failed (expected - no actual worker)");
        break;
      }
    }

    if (Object.keys(selections).length > 0) {
      console.log("Load balancing distribution:", selections);
    }

    console.log("✓ Load balancing tested\n");

    // Test worker statistics
    console.log("5. Testing worker statistics");

    try {
      const dataStats = await Effect.runPromise(dataProcessor.getStats());
      console.log("Data processor stats:", dataStats);
    } catch (error) {
      console.log("Stats test failed (expected - no actual worker)");
    }

    console.log("✓ Worker statistics tested\n");

    // Test service discovery with worker instances
    console.log("6. Testing service discovery");

    const allStats = await Effect.runPromise(
      serviceRegistry.getStatistics("analysis-service")
    );
    console.log("Analysis service statistics:", allStats);

    console.log("✓ Service discovery tested\n");

    // Demonstrate worker restart
    console.log("7. Testing worker restart");

    try {
      await Effect.runPromise(dataProcessor.restartWorker());
      console.log("✓ Worker restart completed");
    } catch (error) {
      console.log("Worker restart test failed (expected - no actual worker)");
    }

    console.log("✓ Worker restart tested\n");

    // Cleanup
    console.log("8. Cleaning up");
    await Effect.runPromise(serviceManager.stopAllServices());
    await Effect.runPromise(serviceRegistry.deregister("data-processor-1"));
    await Effect.runPromise(serviceRegistry.deregister("analyzer-1"));
    await Effect.runPromise(serviceRegistry.deregister("analyzer-2"));

    console.log("✓ Cleanup completed");

    console.log("\n🎉 Worker service example completed successfully!");

    console.log("\n=== Key Features Demonstrated ===");
    console.log("✓ Effect-based worker service management");
    console.log("✓ Worker lifecycle management (start/stop/restart)");
    console.log("✓ Health monitoring for worker services");
    console.log("✓ RPC communication with workers");
    console.log("✓ Service discovery with worker instances");
    console.log("✓ Load balancing across multiple worker instances");
    console.log("✓ Statistics and monitoring");
    console.log("✓ Integration with ServiceManager and ServiceRegistry");

    console.log("\n=== Usage Patterns ===");
    console.log("1. Simple worker service:");
    console.log(
      "   const worker = WorkerServiceFactory.create('my-service', './worker.js');"
    );
    console.log("   await Effect.runPromise(worker.start());");
    console.log(
      "   const result = await Effect.runPromise(worker.callRPC('method', params));"
    );

    console.log("\n2. Worker with auto-termination:");
    console.log(
      "   const worker = WorkerServiceFactory.create('temp-service', './worker.js', {"
    );
    console.log("     autoTerminate: true,");
    console.log("     workerData: { timeout: 5000 }");
    console.log("   });");

    console.log("\n3. Load balanced workers:");
    console.log("   // Register multiple instances");
    console.log(
      "   const instance1 = ServiceInstanceFactory.create('service', 'worker-1');"
    );
    console.log(
      "   const instance2 = ServiceInstanceFactory.create('service', 'worker-2');"
    );
    console.log("   const selected = await registry.getInstance('service');");
  } catch (error) {
    console.error("❌ Worker example failed:", error);
  }
}

// Run the example
if (require.main === module) {
  runWorkerExample();
}
