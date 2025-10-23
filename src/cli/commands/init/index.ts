import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function init() {
  const migrationsDir = join(process.cwd(), 'prisma', 'migrations');

  await mkdir(migrationsDir, { recursive: true });

  const timestamp = Date.now().toString();
  const migrationName = 'initial_migration';
  const migrationDir = join(migrationsDir, `${timestamp}_${migrationName}`);

  await mkdir(migrationDir, { recursive: true });

  const migrationContent = `import type { PrismaClient } from 'prisma-migrations';

export async function up(prisma: PrismaClient) {
  // Add your up migration here
}

export async function down(prisma: PrismaClient) {
  // Add your down migration here
}
`;

  await writeFile(join(migrationDir, 'migration.ts'), migrationContent);

  console.log(`✓ Created migration: ${timestamp}_${migrationName}`);
  console.log(`  Location: ${migrationDir}`);
}
