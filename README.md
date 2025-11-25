# Prisma Migrations

> Rollback and programmatic migrations for Prisma

[![npm](https://img.shields.io/npm/v/prisma-migrations)](https://www.npmjs.com/package/prisma-migrations)
[![codecov](https://codecov.io/gh/yowainwright/prisma-migrations/branch/main/graph/badge.svg)](https://codecov.io/gh/yowainwright/prisma-migrations)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Adds `up`/`down` migrations, rollback, and programmatic API to Prisma. Compatible with Prisma 5, 6, and 7.

| Feature | Prisma Migrate | This Tool |
|---------|---------------|-----------|
| Run migrations forward | Yes | Yes |
| Rollback migrations | No | Yes |
| Run from Node.js code | No | Yes |
| Step-by-step control | No | Yes |

Uses Prisma's `_prisma_migrations` table. Works alongside `prisma migrate`.

## Installation

```bash
npm install prisma-migrations @prisma/client prisma
```

## Quick Start

```bash
# Create a migration
npx prisma-migrations create add_users_table

# Run it
npx prisma-migrations up

# Roll back
npx prisma-migrations down
```

Migration file (`prisma/migrations/[timestamp]_add_users_table/migration.sql`):

```sql
-- Migration: Up
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL
);

-- Migration: Down
DROP TABLE IF EXISTS users;
```

## CLI

```bash
npx prisma-migrations up              # Run all pending
npx prisma-migrations up --steps 2    # Run next 2
npx prisma-migrations down            # Rollback last
npx prisma-migrations down --steps 3  # Rollback last 3
npx prisma-migrations status          # Check status
npx prisma-migrations reset --force   # Rollback all
```

## Programmatic API

```typescript
import { Migrations } from 'prisma-migrations';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const migrations = new Migrations(prisma);

await migrations.up();       // Run all pending
await migrations.down();     // Rollback last
await migrations.pending();  // Get pending list

await prisma.$disconnect();
```

## Production Safety

- **Transactions**: Migrations run in database transactions with automatic rollback on failure
- **Lock Protection**: Advisory locks prevent concurrent migration runs
- **Checksum Validation**: Detects if applied migrations have been modified

For concurrent deployments:

```typescript
const result = await migrations.upIfNotLocked();
if (result.ran) {
  console.log(`Applied ${result.count} migrations`);
}
```

## Documentation

Full documentation: **[jeffry.in/prisma-migrations](https://jeffry.in/prisma-migrations)**

- [Setup Guide](https://jeffry.in/prisma-migrations/docs/setup)
- [CLI Reference](https://jeffry.in/prisma-migrations/docs/api-reference)
- [Monorepo Setup](https://jeffry.in/prisma-migrations/docs/workspaces)
- [Troubleshooting](https://jeffry.in/prisma-migrations/docs/troubleshooting)

## Development

```bash
bun install
bun run build
bun test
```

## License

MIT
