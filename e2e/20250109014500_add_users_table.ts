import { PrismaClient } from "@prisma/client";

/**
 * Migration: add_users_table
 * Created at: 2025-01-09T01:45:00.000Z
 */

export async function up(prisma: PrismaClient): Promise<void> {
  // Raw SQL approach for schema changes
  await prisma.$executeRaw`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  // Clean up in reverse order
  await prisma.$executeRaw`DROP TABLE IF EXISTS users`;
}
