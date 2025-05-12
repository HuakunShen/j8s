# j8s

> A JS service orchestration framework.

> Ideally in a micro service architecture, each service should have own process or even container using tools like pm2 or k8s.
> For lightweight tasks it's not necessary to run multiple containers.
> Running multiple containers on Cloud providers like AWS using Fargate is also expensive.
> So I want to write a orchestrator for running multiple JS services in a single process, but with multiple worker thread.

## Features

1. Each service is in its own file and run with `new Worker()`
2. There should be a service manager managing all services
   1. Start service
   2. Stop service
   3. Health Check
   4. Restart service on crash (like docker, provide multiple strategies: always, unless-stopped, on-failure[:max-retries], no)
   5. Run service as cron job
      1. For non-long-running jobs, start service based on cron job definition
      2. Optional timeout: if the service hangs, kill it
3. Communication between worker and main thread is achieved with `kkrpc` bidirection RPC channel
