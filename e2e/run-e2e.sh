#!/bin/bash
set -e

echo "Starting PostgreSQL in Docker..."
docker-compose -f e2e/docker-compose.yml up -d

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
docker-compose -f e2e/docker-compose.yml down -v

echo "E2E tests complete!"
