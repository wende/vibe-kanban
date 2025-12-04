#!/bin/bash

set -e

echo "🔨 Building frontend..."
(cd frontend && npm run build)

echo "🔨 Building Rust server (release)..."
cargo build --release

echo "🚀 Starting production server..."
./target/release/server
