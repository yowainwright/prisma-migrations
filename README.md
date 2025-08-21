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

### New Classes and Interfaces

#### CommitManager
- Manages git-related actions.
- **Methods**:
  - `getCurrentCommit()`: Retrieve current commit.
  - `getCurrentBranch()`: Retrieve current branch.
  - `getCommitsBetween(from, to)`: Get commits between references.

#### VersionManager
- Manages version-based migrations.
- **Methods**:
  - `registerVersion(version, migrations)`: Register a version.
  - `getMigrationsBetween(from, to)`: Determine migrations to run or rollback.
  - `generateDeploymentPlan(fromVersion, toVersion)`: Generate a plan between versions.

### Interfaces
- **VersionMigrationMapping**: Information associated with migrations for a version.
- **VersionMigrationOptions**: Options for managing versions.
- **VersionMigrationResult**: Result structure for version operations.

### CLI Usage

```bash
# Create a new migration
prisma-migrations create add_users_table

# Run all pending migrations
prisma-migrations up

# Run migrations with options
prisma-migrations up --steps 3
prisma-migrations up --dry-run

# Rollback migrations
prisma-migrations down
prisma-migrations down --steps 2

# Check migration status
prisma-migrations status
```

### Programmatic Usage

```javascript
import { MigrationManager } from "prisma-migrations";

const manager = new MigrationManager();

// Create a new migration
await manager.createMigration({ name: "add_users_table" });

// Run all pending migrations
await manager.runMigrations();

// Rollback last migration
await manager.rollbackMigrations();

// Get migration status
const status = await manager.getMigrationStatus();
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

| Option            | Type                | Default                    | Description                                 |
| ----------------- | ------------------- | -------------------------- | ------------------------------------------- |
| `migrationsDir`   | `string`            | `'./migrations'`           | Directory where migration files are stored  |
| `schemaPath`      | `string`            | `'./prisma/schema.prisma'` | Path to Prisma schema file                  |
| `tableName`       | `string`            | `'_prisma_migrations'`     | Name of the migrations tracking table       |
| `createTable`     | `boolean`           | `true`                     | Whether to auto-create the migrations table |
| `migrationFormat` | `'sql'\|'js'\|'ts'` | `'ts'`                     | Format for new migration files              |
| `extension`       | `string`            | `'.ts'`                    | File extension for new migrations           |
| `prismaClient`    | `PrismaClient`      | `undefined`                | Custom PrismaClient instance (for monorepos)|

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
import { PrismaClient } from '../../../node_modules/@prisma/client';

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

#### `prisma-migrations create <name>`

Create a new migration file.

**Parameters:**

- `<name>`: Migration name (string)

**Example:**

```bash
prisma-migrations create add_users_table
prisma-migrations create "update user schema"
```

---

#### `prisma-migrations up [options]`

Run all pending migrations or specific migrations.

**Options:**

- `-t, --to <timestamp>`: Run up to a specific migration
- `-s, --steps <number>`: Run a specific number of migrations
- `-d, --dry-run`: Preview migrations without applying

**Examples:**

```bash
# Run all pending migrations
prisma-migrations up

# Run up to a specific migration
prisma-migrations up --to 20231201120000

# Run next 3 migrations
prisma-migrations up --steps 3

# Preview without applying
prisma-migrations up --dry-run
```

---

#### `prisma-migrations down [options]`

Rollback migrations.

**Options:**

- `-t, --to <timestamp>`: Rollback to a specific migration
- `-s, --steps <number>`: Rollback a specific number of migrations
- `-d, --dry-run`: Preview rollback without applying

**Examples:**

```bash
# Rollback last migration
prisma-migrations down

# Rollback to a specific migration
prisma-migrations down --to 20231201120000

# Rollback last 2 migrations
prisma-migrations down --steps 2

# Preview rollback
prisma-migrations down --dry-run
```

---

#### `prisma-migrations status`

Get the status of all migrations.

**Example:**

```bash
prisma-migrations status
```

**Output:**

```
add_users_table [applied] - 2023-12-01T12:00:00.000Z
add_posts_table [pending] - Pending
update_users_schema [applied] - 2023-12-01T13:00:00.000Z
```

---

#### `prisma-migrations test`

Test database connection.

**Example:**

```bash
prisma-migrations test
```

---

### Programmatic API

#### `MigrationManager(configPath?)`

Main class for managing migrations programmatically.

**Parameters:**

- `configPath?`: Optional path to configuration file (string)

**Example:**

```javascript
import { MigrationManager } from "prisma-migrations";

const manager = new MigrationManager("./custom-config.js");
```

---

#### `manager.createMigration(options)`

Create a new migration file.

**Parameters:**

- `options`: CreateMigrationOptions object
  - `name`: Migration name (string)
  - `directory?`: Optional custom directory (string)
  - `template?`: Optional custom template (MigrationTemplate)

**Returns:** `Promise<MigrationFile>`

**Example:**

```javascript
const migration = await manager.createMigration({
  name: "add_users_table",
  template: {
    up: "CREATE TABLE users (id SERIAL PRIMARY KEY);",
    down: "DROP TABLE users;",
  },
});
```

---

#### `manager.runMigrations(options?)`

Run pending migrations.

**Parameters:**

- `options?`: RunMigrationOptions object
  - `to?`: Run up to specific migration (string)
  - `steps?`: Number of migrations to run (number)
  - `dryRun?`: Preview without applying (boolean)
  - `force?`: Force run even if already applied (boolean)

**Returns:** `Promise<MigrationResult>`

**Example:**

```javascript
// Run all pending migrations
const result = await manager.runMigrations();

// Run with options
const result = await manager.runMigrations({
  steps: 3,
  dryRun: true,
});
```

---

#### `manager.rollbackMigrations(options?)`

Rollback applied migrations.

**Parameters:**

- `options?`: RollbackMigrationOptions object
  - `to?`: Rollback to specific migration (string)
  - `steps?`: Number of migrations to rollback (number)
  - `dryRun?`: Preview without applying (boolean)
  - `force?`: Force rollback even without down script (boolean)

**Returns:** `Promise<MigrationResult>`

**Example:**

```javascript
// Rollback last migration
const result = await manager.rollbackMigrations();

// Rollback with options
const result = await manager.rollbackMigrations({
  steps: 2,
  dryRun: true,
});
```

---

#### `manager.getMigrationStatus()`

Get status of all migrations.

**Returns:** `Promise<MigrationStatus[]>`

**Example:**

```javascript
const statuses = await manager.getMigrationStatus();
statuses.forEach((status) => {
  console.log(`${status.name} [${status.status}]`);
});
```

---

#### `manager.getMigrationState()`

Get detailed migration state information.

**Returns:** `Promise<MigrationState>`

**Example:**

```javascript
const state = await manager.getMigrationState();
console.log("Applied:", state.applied.length);
console.log("Pending:", state.pending.length);
```

---

#### `manager.testConnection()`

Test database connection.

**Returns:** `Promise<boolean>`

**Example:**

```javascript
const isConnected = await manager.testConnection();
if (isConnected) {
  console.log("Database connection successful");
}
```

---

### Configuration Classes

#### `ConfigManager(configPath?)`

Manages configuration loading and access.

**Methods:**

- `getConfig()`: Get current configuration
- `updateConfig(updates)`: Update configuration
- `getDatabaseUrl()`: Get database URL from various sources

---

#### `FileManager(migrationsDir)`

Manages migration file operations.

**Methods:**

- `createMigrationFile(name, template?)`: Create new migration file
- `readMigrationFiles()`: Read all migration files
- `getMigrationFile(timestamp)`: Get specific migration file
- `getMigrationByName(name)`: Find migration by name
- `parseMigrationContent(content)`: Parse UP/DOWN sections

---

#### `DatabaseAdapter(databaseUrl, tableName?)`

Handles database operations and migration tracking.

**Methods:**

- `connect()`: Connect to database
- `disconnect()`: Disconnect from database
- `getAppliedMigrations()`: Get all applied migrations
- `recordMigration(id, name)`: Record migration as applied
- `removeMigration(id)`: Remove migration record
- `executeMigration(sql)`: Execute migration SQL

---

### Type Definitions

#### `MigrationConfig`

```typescript
interface MigrationConfig {
  migrationsDir: string;
  schemaPath: string;
  databaseUrl?: string;
  tableName?: string;
  createTable?: boolean;
}
```

#### `Migration`

```typescript
interface Migration {
  id: string;
  name: string;
  filename: string;
  timestamp: Date;
  applied: boolean;
  appliedAt?: Date;
  rollback?: string;
}
```

#### `MigrationResult`

```typescript
interface MigrationResult {
  success: boolean;
  migrations: Migration[];
  error?: string;
}
```

#### `MigrationStatus`

```typescript
interface MigrationStatus {
  id: string;
  name: string;
  status: "pending" | "applied" | "error";
  appliedAt?: Date;
  error?: string;
}
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

## Version-Based Migration Management

Manage migrations using git commits or semantic versioning for deployment and rollback scenarios.

### Git Commit-Based Migrations

```javascript
// Deploy to specific commit
const manager = new MigrationManager();
const commitSha = "abc123";
const migrations = await manager.getMigrationsByCommit(commitSha);
await manager.runMigrations({ to: migrations[migrations.length - 1].id });

// Rollback to previous commit
const previousCommit = "def456";
const targetMigrations = await manager.getMigrationsByCommit(previousCommit);
await manager.rollbackMigrations({
  to: targetMigrations[targetMigrations.length - 1].id,
});
```

### Semantic Versioning

```javascript
// Register version with migrations
const manager = new MigrationManager();
await manager.registerVersion("1.2.0", ["20231201120000", "20231201130000"]);

// Deploy to version
await manager.deployToVersion("1.2.0");

// Rollback to previous version
await manager.rollbackToVersion("1.1.0");
```

### CLI Usage

```bash
# Deploy to git commit
prisma-migrations up --commit abc123

# Rollback to commit
prisma-migrations down --commit def456

# Deploy to version
prisma-migrations up --version 1.2.0

# Rollback to version
prisma-migrations down --version 1.1.0
```

---

## Development

Use [Corepack](https://nodejs.org/api/corepack.html) to manage Yarn and ensure you have the latest Node and npm.

```bash
corepack enable
npm install
```

### Key Tasks

- `npm run build` - Build the TypeScript source
- `npm test` - Run unit tests
- `npm run test:docker` - Run end-to-end tests in Docker
- `npm run lint` - Run oxlint on source code
- `npm run format` - Format code with prettier

Use `npm run` commands for task execution.
