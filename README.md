# Prisma Migrations

Assists [Prisma](https://www.prisma.io/docs/orm/prisma-migrate) with migration tooling similar to other js ORMS, like [Knex](https://knexjs.org/guide/migrations.html#rollback)

**Prisma Migrations** is a Node.js library and CLI tool that provides a Knex-like migration management approach for Prisma ORM. Write migrations with familiar `up` and `down` functions while leveraging Prisma's powerful client and type safety.

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

## Installation

```bash
npm install prisma-migrations
# or
bun add prisma-migrations
# or
yarn add prisma-migrations
# or
pnpm add prisma-migrations
```

## Compatibility

This library is designed to work with modern versions of Prisma and Node.js. Please ensure your environment meets these requirements:

### Minimum Requirements

- **Prisma:** 2.0.0 or higher
- **Node.js:** 20.0.0 or higher

### Supported Versions

- **Prisma Client:** 4.0.0+ (peer dependency)
- **Prisma CLI:** 2.0.0+ (peer dependency)
- **Node.js:** 20.x, 21.x, 22.x, 23.x, 24.x

### Build Formats

- **CommonJS CLI:** Works with Prisma 2.0.0+
- **ESM CLI:** Works with Prisma 3.15.0+ (requires ES module support)
- **Library API:** Both ESM and CommonJS builds available

### Notes

- CommonJS CLI (`dist/cli.cjs`) is used by default for maximum compatibility
- ESM CLI (`dist/cli.js`) available for users with compatible Prisma versions
- TypeScript migrations require `tsx` to be installed
- Development and testing: Node.js 24+ is required for unit tests and mocking

## Quick Start

### CLI Usage

```bash
# Initialize migrations directory
prisma-migrations init

# Create a new migration
prisma-migrations create add_users_table

# Run all pending migrations
prisma-migrations up

# Run specific number of migrations
prisma-migrations up --steps 3

# Interactive mode (select which migrations to run)
prisma-migrations up --interactive

# Rollback last migration
prisma-migrations down

# Rollback specific number of migrations
prisma-migrations down --steps 2

# Interactive rollback
prisma-migrations down --interactive

# Check migration status
prisma-migrations status

# List pending migrations
prisma-migrations pending

# List applied migrations
prisma-migrations applied

# Show latest applied migration
prisma-migrations latest

# Rollback all migrations
prisma-migrations reset

# Rollback all and re-run (fresh start)
prisma-migrations fresh

# Enable verbose logging
prisma-migrations --verbose up
```

### Programmatic Usage

```javascript
import { Migrations } from "prisma-migrations";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const migrations = new Migrations(prisma, {
  migrationsDir: "./migrations",
});

// Run all pending migrations
const count = await migrations.up();
console.log(`Applied ${count} migrations`);

// Rollback last migration
await migrations.down();

// Rollback last 2 migrations
await migrations.down(2);

// Get migration status
await migrations.status();

// Get pending migrations
const pending = await migrations.pending();

// Get applied migrations
const applied = await migrations.applied();

// Get latest migration
const latest = await migrations.latest();

// Reset all migrations
await migrations.reset();

// Fresh start (reset and re-run)
await migrations.fresh();

// Disconnect
await prisma.$disconnect();
```

## Migration Files

Write migrations with familiar `up` and `down` functions, just like Knex:

```typescript
import { PrismaClient } from "@prisma/client";

export async function up(prisma: PrismaClient): Promise<void> {
  // Raw SQL for schema changes
  await prisma.$executeRaw`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Use Prisma operations for data seeding
  await prisma.user.createMany({
    data: [
      { email: "admin@example.com", name: "Admin User" },
      { email: "user@example.com", name: "Test User" },
    ],
  });
}

export async function down(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`DROP TABLE IF EXISTS users`;
}
```

**JavaScript migrations work too:**

```javascript
exports.up = async function (prisma) {
  await prisma.$executeRaw`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      user_id INTEGER REFERENCES users(id)
    )
  `;
};

exports.down = async function (prisma) {
  await prisma.$executeRaw`DROP TABLE IF EXISTS posts`;
};
```

## Configuration

Prisma Migrations can be configured in several ways:

### 1. package.json

```json
{
  "prismaMigrations": {
    "migrationsDir": "./migrations",
    "schemaPath": "./prisma/schema.prisma",
    "tableName": "_prisma_migrations",
    "createTable": true,
    "migrationFormat": "ts",
    "extension": ".ts"
  }
}
```

### 2. Configuration file (prisma-migrations.config.js)

```javascript
module.exports = {
  migrationsDir: "./migrations",
  schemaPath: "./prisma/schema.prisma",
  tableName: "_prisma_migrations",
  createTable: true,
  migrationFormat: "ts", // 'sql', 'js', or 'ts'
  extension: ".ts", // or '.js', '.sql'
};
```

### Configuration Options

| Option            | Type                | Default                    | Description                                  |
| ----------------- | ------------------- | -------------------------- | -------------------------------------------- |
| `migrationsDir`   | `string`            | `'./migrations'`           | Directory where migration files are stored   |
| `schemaPath`      | `string`            | `'./prisma/schema.prisma'` | Path to Prisma schema file                   |
| `tableName`       | `string`            | `'_prisma_migrations'`     | Name of the migrations tracking table        |
| `createTable`     | `boolean`           | `true`                     | Whether to auto-create the migrations table  |
| `migrationFormat` | `'sql'\|'js'\|'ts'` | `'ts'`                     | Format for new migration files               |
| `extension`       | `string`            | `'.ts'`                    | File extension for new migrations            |
| `prismaClient`    | `PrismaClient`      | `undefined`                | Custom PrismaClient instance (for monorepos) |

### 3. Environment Variables

Set `DATABASE_URL` environment variable for database connection.

### 4. Monorepo Support

The package now includes enhanced support for monorepo structures. It automatically searches for Prisma Client in multiple locations:

- Current working directory
- Parent directories (up to 5 levels)
- Common monorepo locations
- Generated client paths (`node_modules/.prisma/client`)

#### Custom PrismaClient Instance

For complex monorepo setups, you can provide your own PrismaClient instance:

```javascript
// prisma-migrations.config.mjs
import { PrismaClient } from "../../../node_modules/@prisma/client";

export default {
  migrationsDir: "./migrations",
  schemaPath: "./prisma/schema.prisma",
  tableName: "_prisma_migrations",
  prismaClient: new PrismaClient(), // Provide your own instance
};
```

This is particularly useful when:

- Your Prisma Client is generated in a non-standard location
- You're using a workspace with multiple Prisma schemas
- You need custom PrismaClient configuration

---

## API

### CLI Commands

#### `prisma-migrations init`

Initialize migrations directory with the first migration.

**Example:**

```bash
prisma-migrations init
```

---

#### `prisma-migrations create [name]`

Create a new migration file.

**Parameters:**

- `[name]`: Optional migration name (string)

**Example:**

```bash
prisma-migrations create add_users_table
prisma-migrations create "update user schema"
```

---

#### `prisma-migrations up [options]`

Run pending migrations.

**Options:**

- `-s, --steps <number>`: Run a specific number of migrations
- `-i, --interactive`: Interactive mode to select which migrations to run

**Examples:**

```bash
# Run all pending migrations
prisma-migrations up

# Run next 3 migrations
prisma-migrations up --steps 3

# Interactive mode
prisma-migrations up --interactive
```

---

#### `prisma-migrations down [options]`

Rollback migrations.

**Options:**

- `-s, --steps <number>`: Rollback a specific number of migrations (default: 1)
- `-i, --interactive`: Interactive mode to select which migrations to rollback

**Examples:**

```bash
# Rollback last migration
prisma-migrations down

# Rollback last 2 migrations
prisma-migrations down --steps 2

# Interactive rollback
prisma-migrations down --interactive
```

---

#### `prisma-migrations status`

Show migration status (displays all migrations and whether they're applied).

**Example:**

```bash
prisma-migrations status
```

---

#### `prisma-migrations pending`

List all pending (not yet applied) migrations.

**Example:**

```bash
prisma-migrations pending
```

---

#### `prisma-migrations applied`

List all applied migrations.

**Example:**

```bash
prisma-migrations applied
```

---

#### `prisma-migrations latest`

Show the latest applied migration.

**Example:**

```bash
prisma-migrations latest
```

---

#### `prisma-migrations reset`

Rollback all applied migrations.

**Example:**

```bash
prisma-migrations reset
```

---

#### `prisma-migrations fresh`

Rollback all migrations and re-run them (fresh start).

**Example:**

```bash
prisma-migrations fresh
```

---

#### `prisma-migrations refresh`

Alias for `fresh` command.

**Example:**

```bash
prisma-migrations refresh
```

---

### Programmatic API

The `Migrations` class provides the core functionality for managing migrations programmatically.

#### `new Migrations(prisma, config?)`

**Parameters:**

- `prisma`: PrismaClient instance
- `config?`: Optional MigrationsConfig object
  - `migrationsDir?`: Directory containing migrations (default: discovered automatically)

**Methods:**

- `up(steps?)`: Run pending migrations, optionally limiting to N steps
- `down(steps?)`: Rollback migrations (default: 1)
- `status()`: Display migration status (logs to console)
- `pending()`: Returns array of pending migrations
- `applied()`: Returns array of applied migrations
- `latest()`: Returns the latest applied migration or null
- `reset()`: Rollback all migrations
- `fresh()`: Rollback all and re-run
- `refresh()`: Alias for fresh()
- `upTo(migrationId)`: Run migrations up to specific ID
- `downTo(migrationId)`: Rollback down to specific ID

**Example:**

```typescript
import { Migrations } from "prisma-migrations";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const migrations = new Migrations(prisma);

// Run up to 3 migrations
await migrations.up(3);

// Get pending migrations
const pending = await migrations.pending();
console.log(`${pending.length} migrations pending`);

await prisma.$disconnect();
```

---

### Migration File Formats

Prisma Migrations supports both SQL and JavaScript/TypeScript migration files:

#### SQL Format (Traditional)

```sql
-- UP
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DOWN
DROP TABLE users;
```

#### JavaScript/TypeScript Format (Knex-like)

**TypeScript (.ts files):**

```typescript
import { PrismaClient } from "@prisma/client";

export async function up(prisma: PrismaClient): Promise<void> {
  // Raw SQL approach
  await prisma.$executeRaw`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Or use Prisma operations for data seeding
  await prisma.user.createMany({
    data: [{ email: "admin@example.com" }, { email: "user@example.com" }],
  });
}

export async function down(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`DROP TABLE IF EXISTS users`;
}
```

**JavaScript (.js files):**

```javascript
exports.up = async function (prisma) {
  await prisma.$executeRaw`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
};

exports.down = async function (prisma) {
  await prisma.$executeRaw`DROP TABLE IF EXISTS users`;
};
```

#### Configuration

Set the migration format in your configuration:

```javascript
// prisma-migrations.config.js
module.exports = {
  migrationFormat: "ts", // 'sql', 'js', or 'ts'
  migrationsDir: "./migrations",
  // ... other options
};
```

**Note:** TypeScript migrations require `tsx` to be installed:

```bash
npm install tsx
```

---


## Development

This project uses [Bun](https://bun.sh) for development. Install Bun if you haven't already:

```bash
curl -fsSL https://bun.sh/install | bash
```

Then install dependencies:

```bash
bun install
```

### Key Tasks

- `bun run build` - Build the TypeScript source
- `bun test` - Run unit tests
- `bun run test:e2e` - Run end-to-end tests with Docker
- `bunx oxlint src tests e2e` - Lint source code
- `bunx prettier --write src tests e2e` - Format code with prettier

### Running E2E Tests

The E2E tests run against a real PostgreSQL database in Docker:

```bash
# Run E2E tests (automatically starts Docker)
./e2e/run-e2e.sh

# Or use the npm script
bun run test:e2e
```

E2E tests cover:
- CLI commands (init, create, up, down, status, pending, applied, latest, reset, fresh, refresh)
- Database operations with real PostgreSQL
- Migration file discovery and execution
- Error handling and rollback scenarios
