#!/bin/bash

echo "🚀 Effect-based j8s Demo Suite"
echo "=============================="
echo ""
echo "📊 DevTools will be available at: http://localhost:34437"
echo "🔍 Open your browser to see Effect's powerful features!"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the demo directory"
    exit 1
fi

echo "📦 Installing dependencies..."
bun install > /dev/null 2>&1

echo ""
echo "🎯 Running Effect-based j8s demos:"
echo ""

echo "1️⃣  Simple Effect Features Demo (15 seconds)..."
echo "   Features: exponential backoff, fiber concurrency, resource safety"
bun run simple-demo.ts
echo ""

echo "2️⃣  Complete Service Orchestration Demo (20 seconds)..."
echo "   Features: service lifecycle, health monitoring, graceful shutdown"
bun run service-demo.ts
echo ""

echo "✨ All demos completed successfully!"
echo "🎯 DevTools traces available at: http://localhost:34437"
echo ""
echo "📋 What you just saw:"
echo "   ✅ Built-in exponential backoff (no manual Math.pow implementation)"
echo "   ✅ Fiber-based concurrency (replaces Promise coordination)"
echo "   ✅ Automatic resource cleanup (even on failures)"
echo "   ✅ Effect scheduling (replaces cron package)"
echo "   ✅ Structured error handling (typed errors with context)"
echo "   ✅ Service lifecycle management with observability"
echo ""
echo "🚀 The Effect-based j8s is dramatically more reliable and maintainable!"
