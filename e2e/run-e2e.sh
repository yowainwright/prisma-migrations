#!/bin/bash
set -e

# Use docker compose (new CLI) or docker-compose (old CLI)
DOCKER_COMPOSE="docker compose"
if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
fi

echo "Starting PostgreSQL in Docker..."
$DOCKER_COMPOSE -f e2e/docker-compose.yml up -d

echo "Waiting for PostgreSQL to be ready..."
sleep 5

echo "Installing dependencies in e2e..."
cd e2e
bun install
DATABASE_URL="postgresql://test:test@localhost:5434/prisma_migrations_test" bunx prisma generate --schema=schema.prisma
cd ..

echo "Running E2E tests..."
bun test ./e2e/test.e2e.ts

echo "Cleaning up..."
$DOCKER_COMPOSE -f e2e/docker-compose.yml down -v

echo "E2E tests complete!"
