import { promises as fs } from "fs";
import path from "path";

export type PersistedCollection<T = unknown> = {
  version: number;
  updatedAt: string;
  records: T[];
};

const STORAGE_DIR = process.env.BOSS_LISTERS_STORAGE_DIR || path.join(process.cwd(), "data", "execution");

function collectionPath(collection: string) {
  return path.join(STORAGE_DIR, `${collection}.json`);
}

async function ensureStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

export async function readCollection<T>(collection: string): Promise<PersistedCollection<T>> {
  await ensureStorageDir();
  try {
    const raw = await fs.readFile(collectionPath(collection), "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedCollection<T>>;
    return {
      version: Number(parsed.version) || 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      records: Array.isArray(parsed.records) ? parsed.records : []
    };
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    return { version: 1, updatedAt: new Date(0).toISOString(), records: [] };
  }
}

export async function writeCollection<T>(collection: string, records: T[]): Promise<PersistedCollection<T>> {
  await ensureStorageDir();
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records
  };
  const target = collectionPath(collection);
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(temp, target);
  return payload;
}
