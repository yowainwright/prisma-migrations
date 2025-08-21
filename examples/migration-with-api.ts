import { defineMigration } from "prisma-migrations";

export default defineMigration({
  async up({ prisma, execute, createTable, createIndex }) {
    await execute(createTable('users', `
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      bio TEXT,
      avatar_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `));

    await execute(createIndex('idx_users_email', 'users', 'email'));
  },

  async down({ execute, dropTable }) {
    await execute(dropTable('users'));
  }
});
