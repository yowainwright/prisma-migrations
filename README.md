# Prisma Migrations

> Migration management for Prisma with rollback support

[![npm version](https://badge.fury.io/js/prisma-migrations.svg)](https://www.npmjs.com/package/prisma-migrations)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Prisma Migrations adds the rollback functionality and programmatic control that Prisma's native migrations lack, while maintaining compatibility with Prisma's standard migration system.

## Table of Contents

- [Why Use This?](#why-use-this)
- [Why Not Just Use Prisma?](#why-not-just-use-prisma)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI API](#cli-api)
  - [Commands](#commands)
  - [Global Options](#global-options)
- [Programmatic API](#programmatic-api)
  - [Import](#import)
  - [Constructor](#constructor)
  - [Methods](#methods)
  - [Complete Example](#complete-example)
- [Migration Files](#migration-files)
  - [File Structure](#file-structure)
  - [SQL Migration Format](#sql-migration-format)
  - [Migration Examples](#migration-examples)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
  - [Database Table](#database-table)
  - [Migration Discovery](#migration-discovery)
  - [Migration Execution](#migration-execution)
  - [Migration Flow Diagram](#migration-flow-diagram)
- [Programmatic API](#programmatic-api-1)
- [Compatibility](#compatibility)
- [Comparison with Prisma Migrate](#comparison-with-prisma-migrate)
- [Development](#development)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## Why Use This?

- **Prisma Compatible** - Uses Prisma's standard SQL migration format
- **Rollback Support** - Add down migrations for easy rollback
- **Flexible Control** - Run specific migrations, rollback, dry-run
- **Programmatic API** - Control migrations from your code
- **Modern Build** - ESM/CJS dual support, Node.js 20+ ready

## Why Not Just Use Prisma?

`prisma-migrations` wraps Prisma's native commands and adds powerful data migration capabilities. Use one CLI for everything:

| Feature | Prisma Native | prisma-migrations |
|---------|--------------|-------------------|
| **Schema migrations** | ✓ `prisma migrate dev` | ✓ `prisma-migrations dev` |
| **Deploy migrations** | ✓ `prisma migrate deploy` | ✓ `prisma-migrations deploy` |
| **Rollback support** | ✗ | ✓ `prisma-migrations down` |
| **Data migrations** | ✗ | ✓ SQL migrations with rollback |
| **Programmatic API** | ✗ | ✓ Full Node.js API |
| **Step control** | ✗ | ✓ Run/rollback N migrations |
| **Interactive mode** | ✗ | ✓ Choose migrations |
| **Hooks & validation** | ✗ | ✓ Before/after hooks |

## Unified Workflow

```bash
# Use one CLI for both schema AND data migrations
npx prisma-migrations dev add_users_table    # Schema migration (wraps Prisma)
npx prisma-migrations create seed_admin      # Data migration
npx prisma-migrations up                     # Run all pending
npx prisma-migrations down                   # Rollback if needed
npx prisma-migrations deploy                 # Deploy to production
```

## Features

- **Rollback migrations** - `up` and `down` migration support
- **TypeScript/JavaScript migrations** - Write migrations in TS with type safety
- **Programmatic API** - Run migrations from your JS Runtime code
- **Prisma compatible** - Uses Prisma's standard `_prisma_migrations` table
- **Step control** - Run or rollback specific numbers of migrations
- **Interactive mode** - Select which migrations to apply
- **Zero configuration** - Out-of-the-box working Prisma configuration

---

## Installation

```bash
npm install prisma-migrations
```

---

## Quick Start

### 1. Initialize

```bash
npx prisma-migrations init
```

Creates your first migration file at `prisma/migrations/[timestamp]_initial_migration/migration.sql`

### 2. Create a Migration

```bash
npx prisma-migrations create add_users_table
```

### 3. Write Your Migration

The migration file contains two sections separated by a marker comment:

```sql
-- prisma/migrations/[timestamp]_add_users_table/migration.sql

-- Migration: Up
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Migration: Down
DROP TABLE IF EXISTS users;
```

### 4. Run Migrations

```bash
npx prisma-migrations up
```

### 5. Rollback (when needed)

```bash
npx prisma-migrations down
```

---

## CLI API

All CLI commands use the following format:

```bash
npx prisma-migrations <command> [options]
```

### Commands

#### `init`

Initialize migrations directory with first migration file.

```bash
npx prisma-migrations init
```

**Output:**
```bash
✓ Created migration: 1234567890_initial_migration
  Location: ./prisma/migrations/1234567890_initial_migration
```

---

#### `create [name]`

Create a new migration file with optional name.

```bash
npx prisma-migrations create add_users_table
```

**Arguments:**
- `name` (optional) - Migration name (kebab-case recommended)

**Output:**
```bash
✓ Created migration: 1234567890_add_users_table
  Location: ./prisma/migrations/1234567890_add_users_table
```

---

#### `up [options]`

Run pending migrations.

```bash
# Run all pending migrations
npx prisma-migrations up

# Run next 3 migrations
npx prisma-migrations up --steps 3

# Interactive mode - choose which migrations to run
npx prisma-migrations up --interactive
```

**Options:**
- `--steps <number>` - Number of migrations to run
- `--interactive` or `-i` - Interactive selection mode

**Output:**
```bash
┌──────────┬──────────────────────────────────────────────────┐
│ Status   │ Migrations                                       │
├──────────┼──────────────────────────────────────────────────┤
│ ✓        │ 2 migration(s) applied successfully              │
└──────────┴──────────────────────────────────────────────────┘
```

---

#### `down [options]`

Rollback migrations.

```bash
# Rollback last migration
npx prisma-migrations down

# Rollback last 2 migrations
npx prisma-migrations down --steps 2

# Interactive mode - choose which migrations to rollback
npx prisma-migrations down --interactive
```

**Options:**
- `--steps <number>` - Number of migrations to rollback (default: 1)
- `--interactive` or `-i` - Interactive selection mode

**Output:**
```bash
┌──────────┬──────────────────────────────────────────────────┐
│ Status   │ Migrations                                       │
├──────────┼──────────────────────────────────────────────────┤
│ ↓        │ 1 migration(s) rolled back                       │
└──────────┴──────────────────────────────────────────────────┘
```

---

#### `status`

Show migration status (which migrations are applied/pending).

```bash
npx prisma-migrations status
```

---

#### `pending`

List all pending (not yet applied) migrations.

```bash
npx prisma-migrations pending
```

**Output:**
```bash
3 pending migration(s):

  1234567890_add_users_table
  1234567891_add_posts_table
  1234567892_add_comments_table
```

---

#### `applied`

List all applied migrations.

```bash
npx prisma-migrations applied
```

**Output:**
```bash
2 applied migration(s):

  ✓ 1234567889_initial_migration
  ✓ 1234567890_add_users_table
```

---

#### `latest`

Show the latest applied migration.

```bash
npx prisma-migrations latest
```

---

#### `reset`

Rollback all migrations.

```bash
npx prisma-migrations reset
```

---

#### `fresh`

Rollback all migrations and re-run them (fresh start).

```bash
npx prisma-migrations fresh
```

---

#### `refresh`

Alias for `fresh` command.

```bash
npx prisma-migrations refresh
```

---

### Prisma Wrapper Commands

These commands wrap Prisma's native CLI for a unified migration experience:

#### `dev [name]`

Create and apply a new Prisma schema migration (wraps `prisma migrate dev`).

```bash
npx prisma-migrations dev add_users_table
```

---

#### `deploy`

Apply pending Prisma schema migrations in production (wraps `prisma migrate deploy`).

```bash
npx prisma-migrations deploy
```

---

#### `resolve`

Resolve migration issues (wraps `prisma migrate resolve`).

```bash
# Mark a migration as applied
npx prisma-migrations resolve --applied 20231215120000_migration_name

# Mark a migration as rolled back
npx prisma-migrations resolve --rolled-back 20231215120000_migration_name
```

---

#### `push`

Push schema changes to database without creating migrations (wraps `prisma db push`).

```bash
npx prisma-migrations push
npx prisma-migrations push --skip-generate
```

---

#### `generate`

Generate Prisma Client (wraps `prisma generate`).

```bash
npx prisma-migrations generate
```

---

#### `mcp`

Start the MCP (Model Context Protocol) server for AI assistant integration. Provides 15 tools for managing both data migrations and Prisma operations.

```bash
npx prisma-migrations mcp
```

The MCP server exposes the following tools:
- **Data migrations**: status, pending, applied, up, down, create, dry-run, reset, fresh, refresh
- **Prisma operations**: migrate dev/deploy/resolve, db push, generate

Use with Claude Desktop or other MCP-compatible AI assistants for AI-assisted database management.

---

### Global Options

These options work with any command:

- `--verbose` or `-v` - Enable verbose logging
- `--log-level <level>` - Set log level (silent, error, warn, info, debug, trace)

**Example:**
```bash
npx prisma-migrations up --verbose
npx prisma-migrations --log-level debug up
```

---

## Programmatic API

Use the migrations system from your Node.js/TypeScript code.

### Import

```typescript
import { Migrations } from 'prisma-migrations';
import { PrismaClient } from '@prisma/client';
```

### Constructor

```typescript
new Migrations(prisma: PrismaClient, config?: MigrationsConfig)
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prisma` | `PrismaClient` | Yes | Your Prisma Client instance |
| `config` | `MigrationsConfig` | No | Optional configuration |

**Config Options:**

```typescript
interface MigrationsConfig {
  migrationsDir?: string;  // Default: auto-discovered from ./prisma/migrations
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}
```

**Example:**

```typescript
const prisma = new PrismaClient();
const migrations = new Migrations(prisma, {
  migrationsDir: './database/migrations',
  logLevel: 'info'
});
```

---

### Methods

#### `up(steps?: number): Promise<number>`

Run pending migrations.

**Parameters:**
- `steps` (optional) - Number of migrations to run. If omitted, runs all pending migrations.

**Returns:**
- `Promise<number>` - Number of migrations applied

**Example:**

```typescript
// Run all pending migrations
const count = await migrations.up();
console.log(`Applied ${count} migrations`);

// Run next 3 migrations
await migrations.up(3);
```

---

#### `down(steps?: number): Promise<number>`

Rollback migrations.

**Parameters:**
- `steps` (optional) - Number of migrations to rollback (default: 1)

**Returns:**
- `Promise<number>` - Number of migrations rolled back

**Example:**

```typescript
// Rollback last migration
await migrations.down();

// Rollback last 3 migrations
await migrations.down(3);
```

---

#### `pending(): Promise<MigrationFile[]>`

Get list of pending migrations.

**Returns:**
- `Promise<MigrationFile[]>` - Array of pending migration objects

**MigrationFile Interface:**

```typescript
interface MigrationFile {
  id: string;           // Migration ID (timestamp)
  name: string;         // Migration name
  path: string;         // Full path to migration file
  fileType: 'ts' | 'sql';  // Migration file type
}
```

**Example:**

```typescript
const pending = await migrations.pending();
console.log(`${pending.length} pending migrations:`);
pending.forEach(m => console.log(`  ${m.id}_${m.name}`));
```

---

#### `applied(): Promise<MigrationFile[]>`

Get list of applied migrations.

**Returns:**
- `Promise<MigrationFile[]>` - Array of applied migration objects

**Example:**

```typescript
const applied = await migrations.applied();
console.log(`${applied.length} applied migrations`);
```

---

#### `latest(): Promise<MigrationFile | null>`

Get the latest applied migration.

**Returns:**
- `Promise<MigrationFile | null>` - Latest migration or null if none applied

**Example:**

```typescript
const latest = await migrations.latest();
if (latest) {
  console.log(`Latest: ${latest.id}_${latest.name}`);
}
```

---

#### `status(): Promise<void>`

Display migration status (logs to console).

**Example:**

```typescript
await migrations.status();
```

---

#### `reset(): Promise<number>`

Rollback all migrations.

**Returns:**
- `Promise<number>` - Number of migrations rolled back

**Example:**

```typescript
const count = await migrations.reset();
console.log(`Rolled back ${count} migrations`);
```

---

#### `fresh(): Promise<void>`

Rollback all migrations and re-run them.

**Example:**

```typescript
await migrations.fresh();
```

---

#### `refresh(): Promise<void>`

Alias for `fresh()`.

**Example:**

```typescript
await migrations.refresh();
```

---

### Complete Example

```typescript
import { Migrations } from 'prisma-migrations';
import { PrismaClient } from '@prisma/client';

async function runMigrations() {
  const prisma = new PrismaClient();
  const migrations = new Migrations(prisma);

  try {
    // Check pending migrations
    const pending = await migrations.pending();
    console.log(`Found ${pending.length} pending migrations`);

    // Run migrations
    const applied = await migrations.up();
    console.log(`Successfully applied ${applied} migrations`);

    // Verify latest migration
    const latest = await migrations.latest();
    if (latest) {
      console.log(`Latest migration: ${latest.name}`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigrations();
```

---

## Migration Files

Migration files are SQL files with separate `up` and `down` sections for forward and rollback migrations.

### File Structure

```bash
prisma/migrations/
└── [timestamp]_migration_name/
    └── migration.sql
```

### SQL Migration Format

Each migration file contains two sections separated by special comment markers:

```sql
-- migration.sql

-- Migration: Up
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Migration: Down
DROP TABLE IF EXISTS posts;
```

**How It Works:**
- The `-- Migration: Up` section runs when executing `prisma-migrations up`
- The `-- Migration: Down` section runs when executing `prisma-migrations down`
- Both sections can contain any valid SQL for your database
- The marker comments must be exact: `-- Migration: Up` and `-- Migration: Down`

### Migration Examples

**Adding a Column:**
```sql
-- Migration: Up
ALTER TABLE users ADD COLUMN last_login TIMESTAMP;

-- Migration: Down
ALTER TABLE users DROP COLUMN last_login;
```

**Creating an Index:**
```sql
-- Migration: Up
CREATE INDEX idx_users_email ON users(email);

-- Migration: Down
DROP INDEX idx_users_email;
```

**Data Migration:**
```sql
-- Migration: Up
INSERT INTO roles (name, permissions) VALUES
  ('admin', '{"all": true}'),
  ('user', '{"read": true}');

-- Migration: Down
DELETE FROM roles WHERE name IN ('admin', 'user');
```

---

## Configuration

Prisma Migrations works with zero configuration, but you can customize behavior.

### Option 1: Config File (Recommended)

Create a config file in your project root:

**`.prisma-migrationsrc.json`**

```json
{
  "migrationsDir": "./prisma/migrations",
  "logLevel": "info"
}
```

**`.prisma-migrationsrc.js`**

```javascript
module.exports = {
  migrationsDir: './prisma/migrations',
  logLevel: 'info'
};
```

### Option 2: package.json

```json
{
  "prismaMigrations": {
    "migrationsDir": "./prisma/migrations",
    "logLevel": "info"
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `migrationsDir` | `string` | Auto-discovered | Directory containing migration files |
| `logLevel` | `string` | `'silent'` | Logging level: silent, error, warn, info, debug, trace |

---

## How It Works

### Database Table

Prisma Migrations uses Prisma's standard `_prisma_migrations` table to track applied migrations. This table is automatically created by Prisma and has the following structure:

```sql
CREATE TABLE _prisma_migrations (
  id VARCHAR(255) PRIMARY KEY,
  checksum VARCHAR(64) NOT NULL,
  finished_at TIMESTAMP WITH TIME ZONE,
  migration_name VARCHAR(255) NOT NULL,
  logs TEXT,
  rolled_back_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  applied_steps_count INTEGER NOT NULL DEFAULT 0
);
```

**This means:**
- ✓ 100% compatible with Prisma's native migration system
- ✓ Works with existing Prisma projects
- ✓ No additional setup required
- ✓ Can coexist with `prisma migrate` commands

### Migration Discovery

Migrations are automatically discovered from:

1. `./prisma/migrations` (default Prisma location)
2. Custom directory specified in config
3. Any directory containing folders matching pattern: `[timestamp]_[name]`

### Migration Execution

When you run `up`:

1. Loads all migration files from migrations directory
2. Checks `_prisma_migrations` table to see which are applied
3. Runs pending migrations in chronological order
4. Records each successful migration in the database

When you run `down`:

1. Checks which migrations are applied
2. Runs the `down` function of the most recent migration(s)
3. Removes the migration record from the database

### Migration Flow Diagram

```mermaid
flowchart TD
    Start([CLI Command]) --> DetectType{Command Type?}

    DetectType -->|up| LoadPending[Load Pending Migrations]
    DetectType -->|down| LoadApplied[Load Applied Migrations]
    DetectType -->|status| ShowStatus[Display Migration Status]

    LoadPending --> CheckFileType{File Type?}
    LoadApplied --> ReverseOrder[Reverse Order]

    CheckFileType -->|.ts/.js| ImportTS[Import TypeScript Module]
    CheckFileType -->|.sql| LoadSQL[Read SQL File]

    ImportTS --> ExecuteUp[Execute up Function]
    LoadSQL --> ExecuteSQL[Execute SQL via $executeRawUnsafe]

    ExecuteUp --> RecordDB[(Record in _prisma_migrations)]
    ExecuteSQL --> RecordDB

    ReverseOrder --> CheckDownType{File Type?}

    CheckDownType -->|.ts/.js| ImportDownTS[Import TypeScript Module]
    CheckDownType -->|.sql| WarnNoDown[Warn: No down support]

    ImportDownTS --> ExecuteDown[Execute down Function]

    ExecuteDown --> RemoveDB[(Remove from _prisma_migrations)]
    WarnNoDown --> RemoveDB

    RecordDB --> Success([Migration Complete])
    RemoveDB --> Success
    ShowStatus --> Success

    style Start fill:#e1f5ff
    style Success fill:#d4edda
    style RecordDB fill:#fff3cd
    style RemoveDB fill:#fff3cd
    style WarnNoDown fill:#f8d7da
```

---

## Programmatic API

The library exports TypeScript types for programmatic usage in your Node.js/Bun applications.

### Available Types

```typescript
import type {
  PrismaClient,
  MigrationFile,
  MigrationsConfig,
  MigrationHooks
} from 'prisma-migrations';
```

**Type Definitions:**
- `PrismaClient` - Interface for Prisma Client compatibility
- `MigrationFile` - Represents a migration file structure
- `MigrationsConfig` - Configuration options for the Migrations class
- `MigrationHooks` - Lifecycle hooks for migrations

---

## Compatibility

### Minimum Requirements

- **Node.js:** 20.0.0+, **Bun**
- **Prisma:** 2.0.0+
- **Prisma Client:** 4.0.0+

### Tested With

- **Node.js:** 20.x, 22.x, 24.x, **Bun**
- **Prisma:** 4.x, 5.x, 6.x
- **Databases:** PostgreSQL 14+, 15, 16

---

## Comparison with Prisma Migrate

| Feature | Prisma Migrate | Prisma Migrations |
|---------|---------------|-------------------|
| Create migrations | ✓ | ✓ |
| Run migrations | ✓ | ✓ |
| Rollback migrations | ✗ | ✓ |
| SQL migrations with up/down | ✗ | ✓ |
| Step control | ✗ | ✓ |
| Interactive mode | ✗ | ✓ |
| Programmatic API | ✗ | ✓ |
| Hooks & validation | ✗ | ✓ |

---

## Development

### Prerequisites

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install
```

### Commands

```bash
# Build the library
bun run build

# Run unit tests
bun test

# Run E2E tests
bun run test:e2e

# Lint
bunx oxlint src tests e2e

# Format
bunx prettier --write src tests e2e
```

### Running E2E Tests

E2E tests use Docker to run against a real PostgreSQL database:

```bash
./e2e/run-e2e.sh
```

Tests cover:
- All CLI commands
- Database operations
- Migration file discovery
- Rollback scenarios
- Error handling

---

## Security

The MCP server runs locally only and validates all inputs to prevent command injection. Always backup databases before running destructive operations in production.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for your changes
4. Ensure all tests pass (`bun test && bun run test:e2e`)
5. Submit a pull request

---

## License

MIT

---

## Support

- Documentation: https://github.com/yowainwright/prisma-migrations
- Report Issues: https://github.com/yowainwright/prisma-migrations/issues
- Discussions: https://github.com/yowainwright/prisma-migrations/discussions
