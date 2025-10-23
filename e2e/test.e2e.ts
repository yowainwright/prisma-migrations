import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { spawn } from 'child_process';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';

const e2eDir = join(process.cwd(), 'e2e');
const migrationsDir = join(e2eDir, 'migrations');
const cliPath = join(process.cwd(), 'dist', 'cli.js');

const DATABASE_URL = 'postgresql://test:test@localhost:5434/prisma_migrations_test';

function runCLI(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      DATABASE_URL,
      ...options.env,
    };

    const child = spawn('node', [cliPath, ...args], {
      cwd: options.cwd || e2eDir,
      env,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code: code || 0, stdout, stderr });
    });

    child.on('error', reject);
  });
}

async function waitForPostgres(maxAttempts = 30): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await prisma.$connect();
      await prisma.$disconnect();
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Could not connect to PostgreSQL');
}

describe('E2E: CLI with real database', async () => {
  console.log('Waiting for PostgreSQL to be ready...');
  await waitForPostgres();
  console.log('PostgreSQL is ready');

  if (existsSync(migrationsDir)) {
    rmSync(migrationsDir, { recursive: true });
  }
  mkdirSync(migrationsDir, { recursive: true });

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS _prisma_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await prisma.$executeRaw`TRUNCATE TABLE _prisma_migrations`;
  await prisma.$executeRaw`DROP TABLE IF EXISTS "User"`;
  await prisma.$disconnect();

  test('should initialize migrations directory', async () => {
    const result = await runCLI(['init']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Created migration');
    expect(existsSync(migrationsDir)).toBe(true);
  });

  test('should create a new migration', async () => {
    const result = await runCLI(['create', 'add_users_table']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('add_users_table');
  });

  test('should list pending migrations', async () => {
    const migrationId = Date.now().toString();
    const migrationDir = join(migrationsDir, `${migrationId}_test_migration`);
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(
      join(migrationDir, 'migration.ts'),
      `
        export async function up(prisma) {
          await prisma.$executeRaw\`SELECT 1\`;
        }
        export async function down(prisma) {
          await prisma.$executeRaw\`SELECT 1\`;
        }
      `
    );

    const result = await runCLI(['pending']);

    if (result.code !== 0) {
      console.log('STDERR:', result.stderr);
      console.log('STDOUT:', result.stdout);
    }

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('test_migration');
  });

  test('should run pending migrations and verify', async () => {
    const migrationId = Date.now().toString();
    const migrationDir = join(migrationsDir, `${migrationId}_create_test_table`);
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(
      join(migrationDir, 'migration.ts'),
      `
        export async function up(prisma) {
          await prisma.$executeRaw\`
            CREATE TABLE IF NOT EXISTS test_table (
              id SERIAL PRIMARY KEY,
              name TEXT NOT NULL
            )
          \`;
        }
        export async function down(prisma) {
          await prisma.$executeRaw\`DROP TABLE IF EXISTS test_table\`;
        }
      `
    );

    const upResult = await runCLI(['up']);

    if (upResult.code !== 0) {
      console.log('UP STDERR:', upResult.stderr);
      console.log('UP STDOUT:', upResult.stdout);
    }

    expect(upResult.code).toBe(0);
    expect(upResult.stdout).toContain('applied successfully');

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'test_table'
    `;
    expect(tables.length).toBe(1);

    const appliedResult = await runCLI(['applied']);
    expect(appliedResult.code).toBe(0);
    expect(appliedResult.stdout).toContain('applied migration');

    const statusResult = await runCLI(['status']);
    expect(statusResult.code).toBe(0);
    expect(statusResult.stdout).toContain('Prisma Migrations');

    const downResult = await runCLI(['down', '-s', '1']);
    expect(downResult.code).toBe(0);
    expect(downResult.stdout).toContain('rolled back');

    const tablesAfterDown = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'test_table'
    `;
    expect(tablesAfterDown.length).toBe(0);
    await prisma.$disconnect();
  });

  test('should handle verbose mode', async () => {
    const result = await runCLI(['pending', '--verbose']);

    expect(result.code).toBe(0);
  });

  test('should show latest migration', async () => {
    const result = await runCLI(['latest']);

    expect(result.code).toBe(0);
  });

  test('should run fresh command', async () => {
    const result = await runCLI(['fresh']);

    expect(result.code).toBe(0);
  });

  test('should run reset command', async () => {
    const result = await runCLI(['reset']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Rolled back');
  });

  test('should run refresh command', async () => {
    const result = await runCLI(['refresh']);

    expect(result.code).toBe(0);
  });
});
