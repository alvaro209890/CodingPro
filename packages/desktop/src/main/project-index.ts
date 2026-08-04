import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export const PROJECT_INDEX_VERSION = 1;

export interface PersistedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  totalCostUsd: number;
  turns: number;
  apiCalls: number;
  subagentCalls: number;
}

export interface IndexedSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  usage: PersistedUsage;
}

export interface IndexedProject {
  id: string;
  name: string;
  workspacePath: string;
  lastOpenedAt: string;
  sessions: IndexedSession[];
}

export interface ProjectIndexDocument {
  version: typeof PROJECT_INDEX_VERSION;
  projects: IndexedProject[];
}

export interface ProjectSessionGroupUI {
  id: string;
  name: string;
  workspacePath: string;
  lastOpenedAt: string;
  available: boolean;
  sessions: Array<IndexedSession & { isRunning: boolean }>;
}

export const ZERO_PERSISTED_USAGE: PersistedUsage = Object.freeze({
  apiCalls: 0,
  cacheReadTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  subagentCalls: 0,
  totalCostUsd: 0,
  turns: 0,
});

function iso(value?: string): string {
  if (value && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function projectKey(workspacePath: string): string {
  const normalized = resolve(workspacePath);
  const identity = process.platform === "win32" ? normalized.toLowerCase() : normalized;
  return createHash("sha256").update(identity).digest("hex").slice(0, 16);
}

function cloneUsage(value?: Partial<PersistedUsage>): PersistedUsage {
  return {
    apiCalls: value?.apiCalls ?? 0,
    cacheReadTokens: value?.cacheReadTokens ?? 0,
    inputTokens: value?.inputTokens ?? 0,
    outputTokens: value?.outputTokens ?? 0,
    reasoningTokens: value?.reasoningTokens ?? 0,
    subagentCalls: value?.subagentCalls ?? 0,
    totalCostUsd: value?.totalCostUsd ?? 0,
    turns: value?.turns ?? 0,
  };
}

function sanitizeDocument(value: unknown): ProjectIndexDocument {
  if (typeof value !== "object" || value === null) {
    return { projects: [], version: PROJECT_INDEX_VERSION };
  }
  const projectsRaw = Array.isArray((value as { projects?: unknown }).projects)
    ? ((value as { projects: unknown[] }).projects ?? [])
    : [];
  const projects: IndexedProject[] = [];
  for (const raw of projectsRaw) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Partial<IndexedProject>;
    if (typeof item.workspacePath !== "string" || item.workspacePath.trim() === "") continue;
    const workspacePath = resolve(item.workspacePath);
    const sessions = Array.isArray(item.sessions)
      ? item.sessions.flatMap((session) => {
          if (
            typeof session !== "object" ||
            session === null ||
            typeof session.id !== "string" ||
            session.id.trim() === ""
          ) {
            return [];
          }
          return [
            {
              createdAt: iso(session.createdAt),
              id: session.id,
              title:
                typeof session.title === "string" && session.title.trim() !== ""
                  ? session.title
                  : `Sessão ${session.id.slice(0, 19)}`,
              updatedAt: iso(session.updatedAt),
              usage: cloneUsage(session.usage),
            },
          ];
        })
      : [];
    projects.push({
      id: projectKey(workspacePath),
      lastOpenedAt: iso(item.lastOpenedAt),
      name:
        typeof item.name === "string" && item.name.trim() !== ""
          ? item.name
          : basename(workspacePath),
      sessions,
      workspacePath,
    });
  }
  return { projects, version: PROJECT_INDEX_VERSION };
}

export class ProjectIndexStore {
  readonly #file: string;
  #document: ProjectIndexDocument;

  constructor(file: string, legacyLastWorkspaceFile?: string) {
    this.#file = file;
    this.#document = this.#read();
    if (this.#document.projects.length === 0 && legacyLastWorkspaceFile) {
      this.#migrateLegacy(legacyLastWorkspaceFile);
    }
  }

  #read(): ProjectIndexDocument {
    try {
      return sanitizeDocument(JSON.parse(readFileSync(this.#file, "utf8")));
    } catch {
      return { projects: [], version: PROJECT_INDEX_VERSION };
    }
  }

  #migrateLegacy(file: string): void {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { cwd?: unknown };
      if (typeof parsed.cwd === "string" && parsed.cwd.trim() !== "") {
        this.touchProject(parsed.cwd);
      }
    } catch {
      // Migração best-effort; o arquivo antigo continua preservado.
    }
  }

  #write(): void {
    mkdirSync(dirname(this.#file), { recursive: true });
    const temporary = `${this.#file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.#document, null, 2)}\n`, "utf8");
    try {
      renameSync(temporary, this.#file);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }

  touchProject(workspacePath: string, at = new Date()): IndexedProject {
    const normalized = resolve(workspacePath);
    const id = projectKey(normalized);
    let project = this.#document.projects.find((item) => item.id === id);
    if (!project) {
      project = {
        id,
        lastOpenedAt: at.toISOString(),
        name: basename(normalized) || normalized,
        sessions: [],
        workspacePath: normalized,
      };
      this.#document.projects.push(project);
    } else {
      project.lastOpenedAt = at.toISOString();
      project.workspacePath = normalized;
      project.name = basename(normalized) || normalized;
    }
    this.#write();
    return structuredClone(project);
  }

  upsertSession(workspacePath: string, session: IndexedSession): void {
    const project = this.touchProject(workspacePath, new Date(session.updatedAt));
    const stored = this.#document.projects.find((item) => item.id === project.id);
    if (!stored) return;
    const normalized: IndexedSession = {
      createdAt: iso(session.createdAt),
      id: session.id,
      title: session.title.trim() || `Sessão ${session.id.slice(0, 19)}`,
      updatedAt: iso(session.updatedAt),
      usage: cloneUsage(session.usage),
    };
    const index = stored.sessions.findIndex((item) => item.id === session.id);
    if (index === -1) stored.sessions.push(normalized);
    else stored.sessions[index] = normalized;
    stored.sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    this.#write();
  }

  getSession(workspacePath: string, sessionId: string): IndexedSession | undefined {
    const id = projectKey(workspacePath);
    const session = this.#document.projects
      .find((project) => project.id === id)
      ?.sessions.find((item) => item.id === sessionId);
    return session ? structuredClone(session) : undefined;
  }

  groups(running?: { workspacePath: string; sessionId: string }): ProjectSessionGroupUI[] {
    return [...this.#document.projects]
      .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
      .map((project) => ({
        available: existsSync(project.workspacePath),
        id: project.id,
        lastOpenedAt: project.lastOpenedAt,
        name: project.name,
        sessions: [...project.sessions]
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map((session) => ({
            ...structuredClone(session),
            isRunning:
              running?.sessionId === session.id &&
              resolve(running.workspacePath) === resolve(project.workspacePath),
          })),
        workspacePath: project.workspacePath,
      }));
  }
}
