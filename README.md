# Prisma Migrations

> Migration management for Prisma with rollback support

[![npm version](https://badge.fury.io/js/prisma-migrations.svg)](https://www.npmjs.com/package/prisma-migrations)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Prisma Migrations adds the rollback functionality and programmatic control that Prisma's native migrations lack, while maintaining compatibility with Prisma's standard migration system.

## Why Use This?

- **Familiar Knex-like API** - `up` and `down` functions you already know
- **TypeScript First** - Full type safety for your migrations
- **Prisma Powered** - Use both raw SQL and Prisma operations
- **Flexible Control** - Run specific migrations, rollback, dry-run
- **Modern Build** - ESM/CJS dual support, Node.js 20+ ready

## Why Not Just Use Prisma?

Prisma's native migration system is excellent for schema-driven development, but it lacks:

- **No rollback functionality** - Once applied, migrations can't be easily undone
- **Limited programmatic control** - Can't run specific numbers of migrations or rollback steps
- **No up/down functions** - Migrations are pure SQL, no TypeScript/JavaScript logic
- **Schema-only approach** - Difficult to mix schema changes with data seeding/transformation
- **No granular migration management** - Can't easily target specific migrations or preview changes

This library complements Prisma by providing the migration management patterns developers expect from other ORMs like Knex, while still leveraging Prisma's powerful client and type safety.

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

Creates your first migration file at `prisma/migrations/[timestamp]_initial_migration/migration.ts`

### 2. Create a Migration

```bash
npx prisma-migrations create add_users_table
```

### 3. Write Your Migration

```typescript
// prisma/migrations/[timestamp]_add_users_table/migration.ts
import type { PrismaClient } from 'prisma-migrations';

export async function up(prisma: PrismaClient) {
  await prisma.$executeRaw`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export async function down(prisma: PrismaClient) {
  await prisma.$executeRaw`DROP TABLE IF EXISTS users`;
}
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
  id: string;      // Migration ID (timestamp)
  name: string;    // Migration name
  path: string;    // Full path to migration file
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

Migration files are TypeScript (or JavaScript) modules with `up` and `down` functions.

### File Structure

```bash
prisma/migrations/
└── [timestamp]_migration_name/
    └── migration.ts
```

### TypeScript Migration

```typescript
import type { PrismaClient } from 'prisma-migrations';

export async function up(prisma: PrismaClient): Promise<void> {
  // Your migration code here
  await prisma.$executeRaw`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT,
      published BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export async function down(prisma: PrismaClient): Promise<void> {
  // Rollback code here
  await prisma.$executeRaw`DROP TABLE IF EXISTS posts`;
}
```

### JavaScript Migration

```javascript
exports.up = async function(prisma) {
  await prisma.$executeRaw`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT
    )
  `;
};

exports.down = async function(prisma) {
  await prisma.$executeRaw`DROP TABLE IF EXISTS posts`;
};
```

### Using Prisma Client Operations

You can use any Prisma Client method in migrations:

```typescript
export async function up(prisma: PrismaClient) {
  // Create table with raw SQL
  await prisma.$executeRaw`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      role VARCHAR(50) DEFAULT 'user'
    )
  `;

  // Seed initial data using Prisma
  await prisma.user.createMany({
    data: [
      { email: 'admin@example.com', role: 'admin' },
      { email: 'user@example.com', role: 'user' },
    ],
  });
}

export async function down(prisma: PrismaClient) {
  await prisma.$executeRaw`DROP TABLE IF EXISTS users`;
}
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

---

## TypeScript Support

Full TypeScript support out of the box.

### PrismaClient Type

Import the `PrismaClient` type from `prisma-migrations`:

```typescript
import type { PrismaClient } from 'prisma-migrations';

export async function up(prisma: PrismaClient) {
  // Full type safety and autocomplete
  await prisma.$executeRaw`...`;
}
```

### Migration Types

```typescript
import type {
  MigrationFile,
  MigrationFunction,
  MigrationsConfig
} from 'prisma-migrations';
```

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
| Rollback migrations | x | ✓ |
| TypeScript migrations | x | ✓ |
| JavaScript migrations | x | ✓ |
| Step control | x | ✓ |
| Interactive mode | x | ✓ |
| Programmatic API | x | ✓ |
| SQL migrations | ✓ | ✓ (via `$executeRaw`) |

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
