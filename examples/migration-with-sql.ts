import { defineMigration } from "prisma-migrations";

export default defineMigration({
  async up({ sql, execute }) {
    await execute(`
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        content TEXT,
        published BOOLEAN DEFAULT false,
        author_id INTEGER NOT NULL,
        view_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await execute(`
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT
      )
    `);

    await execute(`
      CREATE TABLE post_categories (
        post_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, category_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      )
    `);

    await execute(`CREATE INDEX idx_posts_author ON posts(author_id)`);
    await execute(`CREATE INDEX idx_posts_published ON posts(published)`);
    await execute(`CREATE INDEX idx_posts_slug ON posts(slug)`);

    const defaultCategories = ["Technology", "Design", "Business"];
    for (const category of defaultCategories) {
      const slug = category.toLowerCase().replace(/\s+/g, "-");

      await execute(`
        INSERT INTO categories (name, slug) 
        VALUES ('${category}', '${slug}')
      `);
    }
  },

  async down({ execute }) {
    await execute(`DROP TABLE IF EXISTS post_categories`);
    await execute(`DROP TABLE IF EXISTS posts`);
    await execute(`DROP TABLE IF EXISTS categories`);
  },
});
