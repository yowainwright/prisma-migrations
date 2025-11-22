# Prisma Migrations

> Add rollback and programmatic control to Prisma

[![npm version](https://badge.fury.io/js/prisma-migrations.svg)](https://www.npmjs.com/package/prisma-migrations)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

If you're using Prisma but miss having rollback and programmatic migration control like other ORMs, this fills those gaps. It wraps Prisma's migration system and adds the features that should have been there from the start.

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
- [Programmatic API](#programmatic-api)
- [Migration Files](#migration-files)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Comparison](#comparison)
- [Alternatives](#alternatives)
- [Development](#development)
- [License](#license)

## The Problem

Prisma's `prisma migrate` works well for forward migrations, but has some gaps:

- **No rollback** - Once applied, there's no built-in way to undo migrations
- **No programmatic API** - Can't run migrations from your Node.js code
- **Limited control** - Can't run specific numbers of migrations or choose which to apply

Meanwhile, pretty much every other ORM (Knex, TypeORM, Sequelize, Rails, Laravel) has had these features for years.

When you hit these limitations in production, you're stuck manually writing SQL or working around Prisma's constraints.

## The Solution

This tool wraps Prisma and adds what's missing:

| Feature | Prisma Migrate | This Tool |
|---------|---------------|-----------|
| Run migrations forward | ✓ | ✓ |
| Deploy to production | ✓ | ✓ |
| Rollback migrations | ✗ | ✓ |
| Run from Node.js code | ✗ | ✓ |
| Step-by-step control | ✗ | ✓ |
| Interactive mode | ✗ | ✓ |
| Up/down migrations | ✗ | ✓ |

**Key point:** This is 100% compatible with Prisma. It uses Prisma's standard `_prisma_migrations` table and works alongside `prisma migrate` commands.

## Features

- **Rollback support** - `up` and `down` migrations like other ORMs
- **Programmatic API** - Run migrations from your JavaScript/TypeScript code
- **Step control** - Run or rollback N migrations at a time
- **Interactive mode** - Choose which migrations to apply
- **SQL migrations** - Standard SQL format with up/down sections
- **Zero config** - Works out of the box with existing Prisma projects
- **Prisma compatible** - Uses Prisma's `_prisma_migrations` table

---

## Installation

```bash
# Install the tool
npm install prisma-migrations

# You'll need Prisma too (if you don't have it already)
npm install @prisma/client prisma
```

> **Note:** For Prisma 7+, you also need database adapters:
> ```bash
> npm install @prisma/adapter-pg pg           # PostgreSQL
> npm install @prisma/adapter-mysql2 mysql2   # MySQL
> npm install @prisma/adapter-sqlite better-sqlite3  # SQLite
> ```

---

## Quick Start

### 1. Create a migration

```bash
npx prisma-migrations create add_users_table
```

This creates: `prisma/migrations/[timestamp]_add_users_table/migration.sql`

### 2. Write your migration

The migration file has two sections - one for applying, one for rolling back:

```sql
-- Migration: Up
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Migration: Down
DROP TABLE IF EXISTS users;
```

### 3. Run it

```bash
npx prisma-migrations up
```

### 4. Roll back (when you need to)

```bash
npx prisma-migrations down
```

That's it. The basics work like Knex, TypeORM, or any other migration system you've probably used before.

---

## CLI Commands

### Core Commands

```bash
# Run all pending migrations
npx prisma-migrations up

# Run next 2 migrations only
npx prisma-migrations up --steps 2

# Interactive mode - choose which to run
npx prisma-migrations up --interactive

# Rollback last migration
npx prisma-migrations down

# Rollback last 3 migrations
npx prisma-migrations down --steps 3

# Create a new migration
npx prisma-migrations create migration_name

# Check status
npx prisma-migrations status

# List pending migrations
npx prisma-migrations pending

# List applied migrations
npx prisma-migrations applied
```

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

### API Methods

```typescript
// Run migrations
await migrations.up()              // Run all pending
await migrations.up(3)             // Run next 3

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
await migrations.refresh()         // Alias for fresh()
```

Full TypeScript types included.

---

## Migration Files

### File Structure

```
prisma/migrations/
└── 20240101000000_add_users/
    └── migration.sql
```

Timestamp + name format, just like Prisma's default.

### SQL Format

Each migration file contains two sections:

```sql
-- Migration: Up
-- This runs when you do: npx prisma-migrations up
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT
);

-- Migration: Down
-- This runs when you do: npx prisma-migrations down
DROP TABLE IF EXISTS posts;
```

The marker comments (`-- Migration: Up` and `-- Migration: Down`) separate the two sections.

### Examples

**Adding a column:**
```sql
-- Migration: Up
ALTER TABLE users ADD COLUMN last_login TIMESTAMP;

-- Migration: Down
ALTER TABLE users DROP COLUMN last_login;
```

**Creating an index:**
```sql
-- Migration: Up
CREATE INDEX idx_users_email ON users(email);

-- Migration: Down
DROP INDEX idx_users_email;
```

**Data migration:**
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

Works with zero configuration, but you can customize if needed.

### Config File

Create `.prisma-migrationsrc.json` in your project root:

```json
{
  "migrationsDir": "./prisma/migrations",
  "logLevel": "info"
}
```

Or `.prisma-migrationsrc.js`:

```javascript
module.exports = {
  migrationsDir: './prisma/migrations',
  logLevel: 'info'
};
```

Or in `package.json`:

```json
{
  "prisma-migrations": {
    "migrationsDir": "./prisma/migrations"
  }
}
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `migrationsDir` | `./prisma/migrations` | Where your migration files live |
| `logLevel` | `silent` | Logging: silent, error, warn, info, debug, trace |

---

## How It Works

**Database table:** Uses Prisma's standard `_prisma_migrations` table to track state. This means:
- Works with existing Prisma projects
- Compatible with `prisma migrate` commands
- No additional setup needed

**Migration execution:**
1. Reads migration files from `prisma/migrations/`
2. Checks `_prisma_migrations` table for what's applied
3. Runs pending migrations in order (for `up`)
4. Runs down functions in reverse (for `down`)
5. Updates `_prisma_migrations` table

**File discovery:** Automatically finds migrations in the standard Prisma location (`./prisma/migrations/[timestamp]_[name]/`).

---

## Comparison

### vs Prisma Migrate

**Use Prisma Migrate if:**
- You only ever need forward migrations
- CLI-only execution is fine
- You don't need rollback

**Use this tool if:**
- You need to rollback migrations (especially in production)
- You want to run migrations programmatically
- You want step-by-step control
- You're coming from Knex/TypeORM/etc and miss those features

Both can coexist - they use the same migration table.

### vs Other ORMs

**Knex, TypeORM, Sequelize** have full-featured migration systems built-in. If you're starting fresh and migration control is important, consider using one of those with Prisma types (our monorepo setup guide shows how).

This tool exists for when you're already using Prisma and just need to fill the gaps.

---

## Alternatives

Be honest about your options:

**Option A: Stick with Prisma Migrate**
If you don't need rollback and CLI-only works for you, just use Prisma's built-in system.

**Option B: Switch to Knex migrations**
If you're early in a project, Knex has battle-tested migrations. You can use Knex for migrations + Prisma for queries (see our monorepo guide).

**Option C: Use this tool**
If you're committed to Prisma but need rollback and programmatic control, this fills the gap without requiring a full ORM switch.

---

## Development

### Setup

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Build
bun run build

# Test
bun test

# E2E tests (requires Docker)
bun run e2e
```

### Contributing

Contributions welcome. Please:
1. Add tests for new features
2. Run `bun run precommit` before submitting
3. Keep the scope focused on migration management

---

## License

MIT

---

## Support

- **Issues:** https://github.com/yowainwright/prisma-migrations/issues
- **Discussions:** https://github.com/yowainwright/prisma-migrations/discussions

---

## FAQ

**Q: Will this break my existing Prisma setup?**
A: No. It uses the same `_prisma_migrations` table that Prisma uses. You can use both systems side-by-side.

**Q: Do I have to migrate away from Prisma?**
A: No. This wraps Prisma, it doesn't replace it. Keep using Prisma for everything else.

**Q: Can I mix Prisma's migrations and these migrations?**
A: Yes. They track to the same table. Schema changes via `prisma migrate dev`, data migrations via `prisma-migrations create`.

**Q: What if a rollback fails?**
A: Your down migration is just SQL - if it fails, you'll get a clear error and can fix the SQL or handle it manually. Always test rollbacks in staging first.

**Q: Is this production-ready?**
A: It's been used in production projects. That said, test your rollback migrations thoroughly before relying on them in prod.
