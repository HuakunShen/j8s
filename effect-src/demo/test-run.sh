#!/bin/bash

echo "🚀 Effect-based j8s Demo Test Runner"
echo "======================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the demo directory"
    exit 1
fi

echo "📦 Installing dependencies..."
bun install

echo ""
echo "🎯 Available demos:"
echo "1. Quick DevTools Demo (5 minutes)"
echo "2. Basic Service Demo (10 minutes)" 
echo "3. Worker Services Demo (8 minutes)"
echo "4. All demos"
echo ""

read -p "Choose demo (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting Quick DevTools Demo..."
        echo "📊 DevTools will be available at: http://localhost:34437"
        echo "🔍 Open your browser to see Effect's features in action!"
        echo ""
        sleep 2
        tsx run-demo.ts
        ;;
    2)
        echo ""
        echo "🚀 Starting Basic Service Demo..."
        echo "📊 DevTools will be available at: http://localhost:34437"
        echo ""
        sleep 2
        tsx basic-demo.ts
        ;;
    3)
        echo ""
        echo "🚀 Starting Worker Services Demo..."
        echo "📊 DevTools will be available at: http://localhost:34437"
        echo ""
        sleep 2
        tsx worker-demo.ts
        ;;
    4)
        echo ""
        echo "🚀 Starting All Demos Concurrently..."
        echo "📊 DevTools will be available at: http://localhost:34437"
        echo ""
        sleep 2
        npm run demo:both
        ;;
    *)
        echo "❌ Invalid choice. Please run again and choose 1-4."
        exit 1
        ;;
esac

echo ""
echo "✨ Demo completed!"
echo "🎯 Don't forget to check DevTools at http://localhost:34437"
