#!/usr/bin/env node
import { Command } from 'commander';
import { MigrationManager } from './migration-manager';

const program = new Command();
const manager = new MigrationManager();

program
  .version('1.0.0')
  .description('Prisma Migrations CLI');

program
  .command('create <name>')
  .description('Create a new migration')
  .action(async (name: string) => {
    try {
      await manager.createMigration({ name });
      console.log(`Migration '${name}' created successfully.`);
    } catch (error) {
      console.error(`Error creating migration: ${error.message}`);
    }
  });

program
  .command('up')
  .description('Run all pending migrations')
  .option('-t, --to <timestamp>', 'Run up to a specific migration')
  .option('-s, --steps <number>', 'Run a specific number of migrations', parseInt)
  .option('-d, --dry-run', 'Preview migrations without applying')
  .action(async ({ to, steps, dryRun }) => {
    try {
      const result = await manager.runMigrations({ to, steps, dryRun });
      console.log(`Migrations applied successfully: ${result.success}`);
    } catch (error) {
      console.error(`Error running migrations: ${error.message}`);
    }
  });

program
  .command('down')
  .description('Rollback migrations')
  .option('-t, --to <timestamp>', 'Rollback to a specific migration')
  .option('-s, --steps <number>', 'Rollback a specific number of migrations', parseInt)
  .option('-d, --dry-run', 'Preview rollback without applying')
  .action(async ({ to, steps, dryRun }) => {
    try {
      const result = await manager.rollbackMigrations({ to, steps, dryRun });
      console.log(`Migrations rolled back successfully: ${result.success}`);
    } catch (error) {
      console.error(`Error rolling back migrations: ${error.message}`);
    }
  });

program
  .command('status')
  .description('Get migration status')
  .action(async () => {
    try {
      const status = await manager.getMigrationStatus();
      status.forEach(({ id, name, status, appliedAt }) => {
        console.log(`${name} [${status}] - ${appliedAt ? appliedAt : 'Pending'}`);
      });
    } catch (error) {
      console.error(`Error retrieving status: ${error.message}`);
    }
  });

program
  .command('test')
  .description('Test database connection')
  .action(async () => {
    try {
      const result = await manager.testConnection();
      console.log(`Database connection successful: ${result}`);
    } catch (error) {
      console.error(`Error testing connection: ${error.message}`);
    }
  });

program.parse(process.argv);

