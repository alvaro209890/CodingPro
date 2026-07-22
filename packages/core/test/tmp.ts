import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function makeTmpRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "codingpro-core-"));
}

export async function cleanup(dir: string): Promise<void> {
  await rm(dir, { force: true, recursive: true });
}
