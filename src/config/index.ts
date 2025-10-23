import { lilconfig } from 'lilconfig';
import type { MigrationsConfig } from '../types';

export async function loadConfig(): Promise<MigrationsConfig> {
  const explorer = lilconfig('prisma-migrations');
  const result = await explorer.search();
  return result?.config || {};
}
