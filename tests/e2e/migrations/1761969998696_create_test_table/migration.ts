export async function up(prisma) {
  await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS test_table (
              id SERIAL PRIMARY KEY,
              name TEXT NOT NULL
            )
          `;
}
export async function down(prisma) {
  await prisma.$executeRaw`DROP TABLE IF EXISTS test_table`;
}
