export async function up(prisma) {
  await prisma.$executeRaw`SELECT 1`;
}
export async function down(prisma) {
  await prisma.$executeRaw`SELECT 1`;
}
