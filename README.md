# Prisma Migrations

> Rollback and programmatic migrations for Prisma

[![npm](https://img.shields.io/npm/v/prisma-migrations)](https://www.npmjs.com/package/prisma-migrations)
[![codecov](https://codecov.io/gh/yowainwright/prisma-migrations/branch/main/graph/badge.svg)](https://codecov.io/gh/yowainwright/prisma-migrations)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Adds `up`/`down` migrations, rollback, programmatic API, and monorepo type-sharing to Prisma. Compatible with Prisma 5, 6, and 7.

| Feature | Prisma Migrate | This Tool |
|---------|---------------|-----------|
| Run migrations forward | ✓ | ✓ |
| Rollback migrations | ✗ | ✓ |
| Run from Node.js code | ✗ | ✓ |
| Step-by-step control | ✗ | ✓ |
| Interactive mode | ✗ | ✓ |
| Monorepo type-sharing | ✗ | ✓ |

Uses Prisma's `_prisma_migrations` table. Works alongside `prisma migrate`.

## Installation

```bash
npm install prisma-migrations @prisma/client prisma
```

For Prisma 7+, also install database adapters:
```bash
npm install @prisma/adapter-pg pg           # PostgreSQL
npm install @prisma/adapter-mysql2 mysql2   # MySQL
```

## Quick Start

```bash
# Create a migration
npx prisma-migrations create add_users_table
```

Edit `prisma/migrations/[timestamp]_add_users_table/migration.sql`:

```sql
-- Migration: Up
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL
);

-- Migration: Down
DROP TABLE IF EXISTS users;
```

```bash
# Run it
npx prisma-migrations up

# Roll back
npx prisma-migrations down
```

---

## CLI Commands

### Core Commands

```bash
# Initialize migrations directory
npx prisma-migrations init

# Create a new migration
npx prisma-migrations create migration_name

# Run all pending migrations
npx prisma-migrations up

# Run next 2 migrations only
npx prisma-migrations up --steps 2

# Interactive mode - choose which to run
npx prisma-migrations up --interactive

# See what would run without executing
npx prisma-migrations up --dry-run

# Rollback last migration
npx prisma-migrations down

# Rollback last 3 migrations
npx prisma-migrations down --steps 3

# Check status
npx prisma-migrations status

# List pending migrations
npx prisma-migrations pending

# List applied migrations
npx prisma-migrations applied

# Show latest applied migration
npx prisma-migrations latest

# Rollback all migrations
npx prisma-migrations reset --force

# Rollback all and re-run (fresh start)
npx prisma-migrations fresh --force

# Alias for fresh
npx prisma-migrations refresh --force
```

### Global Options

```bash
# Enable verbose logging
npx prisma-migrations --verbose status

# Set specific log level
npx prisma-migrations --log-level debug up
```

Available log levels: `silent`, `error`, `warn`, `info`, `debug`, `trace`

### Monorepo Commands

For sharing Prisma types across packages in a monorepo:

```bash
# In your source package (where schema.prisma lives)
npx prisma-migrations setup-source

# In consumer packages that need the types
npx prisma-migrations link-types @your-org/source-package

# Validate setup
npx prisma-migrations validate --source              # Validate source package
npx prisma-migrations validate --check source-pkg    # Validate consumer package
```

See the [Monorepo Setup Guide](#monorepo-setup) below for details.

### Prisma Wrappers

These commands wrap Prisma's native CLI for a unified workflow:

```bash
# Schema migrations (wraps prisma migrate dev)
npx prisma-migrations dev add_user_field

# Deploy to production (wraps prisma migrate deploy)
npx prisma-migrations deploy

# Generate Prisma Client (wraps prisma generate)
npx prisma-migrations generate

# Push schema without migrations (wraps prisma db push)
npx prisma-migrations push
npx prisma-migrations push --skip-generate

# Resolve migration issues (wraps prisma migrate resolve)
npx prisma-migrations resolve --applied migration_name
npx prisma-migrations resolve --rolled-back migration_name
```

Use one CLI for everything instead of switching between `prisma` and `prisma-migrations`.

---

## Programmatic API

Run migrations from your Node.js/TypeScript code:

```typescript
import { Migrations } from 'prisma-migrations';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const migrations = new Migrations(prisma);

// Run all pending migrations
await migrations.up();

// Rollback last migration
await migrations.down();

// Check status
const pending = await migrations.pending();
console.log(`${pending.length} migrations pending`);

await prisma.$disconnect();
```

### Constructor Options

```typescript
// Default (uses ./prisma/migrations)
const migrations = new Migrations(prisma);

// Custom migrations directory
const migrations = new Migrations(prisma, {
  migrationsDir: './database/migrations'
});
```

### API Methods

```typescript
// Run migrations
await migrations.up()              // Run all pending
await migrations.up(3)             // Run next 3

// Dry run - see what would run without executing
await migrations.dryRun()          // All pending migrations
await migrations.dryRun(2)         // Next 2 migrations

// Rollback migrations
await migrations.down()            // Rollback last 1
await migrations.down(2)           // Rollback last 2

// Query status
await migrations.pending()         // Get pending migrations
await migrations.applied()         // Get applied migrations
await migrations.latest()          // Get latest migration
await migrations.status()          // Print status to console

// Bulk operations
await migrations.reset()           // Rollback all
await migrations.fresh()           // Rollback all + re-run
await migrations.refresh()         // Rollback all + re-run (returns {down, up} counts)
```

Full TypeScript types included.

---

## Migration Files

Files are stored at `prisma/migrations/[timestamp]_[name]/migration.sql` - same format as Prisma.

Each file has two sections separated by marker comments:

```sql
-- Migration: Up
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL
);

-- Migration: Down
DROP TABLE IF EXISTS posts;
```

Examples:

```sql
-- Add column
-- Migration: Up
ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
-- Migration: Down
ALTER TABLE users DROP COLUMN last_login;

-- Create index
-- Migration: Up
CREATE INDEX idx_users_email ON users(email);
-- Migration: Down
DROP INDEX idx_users_email;

-- Data migration
-- Migration: Up
INSERT INTO roles (name) VALUES ('admin'), ('user');
-- Migration: Down
DELETE FROM roles WHERE name IN ('admin', 'user');
```

---

## Configuration

Optional. Create `.prisma-migrationsrc.json`:

```json
{
  "migrationsDir": "./prisma/migrations",
  "logLevel": "info"
}
```

Or add to `package.json`:

```json
{
  "prisma-migrations": {
    "migrationsDir": "./prisma/migrations"
  }
}
```

---

## Monorepo Setup

Share Prisma types across packages (useful with Kysely, Knex, etc).

**Source package** (has `schema.prisma`):
```bash
cd packages/api
npx prisma-migrations setup-source
```

This configures exports, updates tsconfig, and creates type files.

**Consumer package** (needs the types):
```bash
cd packages/worker
npx prisma-migrations link-types @your-org/api
```

**Use in consumer:**
```typescript
import type * as Prisma from "@your-org/api/db/types";

type Database = {
  User: Prisma.User;
  Post: Prisma.Post;
};

const db = new Kysely<Database>({ /* ... */ });
```

**Validate:**
```bash
npx prisma-migrations validate --source              # In source package
npx prisma-migrations validate --check @your-org/api  # In consumer
```

---

## How It Works

Uses Prisma's `_prisma_migrations` table to track state. Reads SQL files from `prisma/migrations/[timestamp]_[name]/`, executes up/down sections, and updates the tracking table. Compatible with existing Prisma projects - no additional setup needed.

---

## Development

```bash
bun install
bun run build
bun test
bun run e2e  # requires Docker
```

Contributions welcome. Add tests and run `bun run precommit` before submitting.

---

## License

MIT

---

## Support

- **Issues:** https://github.com/yowainwright/prisma-migrations/issues
- **Discussions:** https://github.com/yowainwright/prisma-migrations/discussions

---

## FAQ

**Will this break my existing Prisma setup?**
No. Uses the same `_prisma_migrations` table. Works alongside Prisma's tools.

**Can I mix Prisma migrations and this tool?**
Yes. Schema changes via `prisma migrate dev`, data migrations via this tool.

**What if a rollback fails?**
You get a clear error and can fix the SQL manually. Test rollbacks in staging first.
