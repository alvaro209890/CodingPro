export type UpdateMode = "nsis" | "portable" | "development";
export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateStateUI {
  mode: UpdateMode;
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string | undefined;
  releaseNotes?: string | undefined;
  progress?: number | undefined;
  transferred?: number | undefined;
  total?: number | undefined;
  manualUrl?: string | undefined;
  error?: string | undefined;
}

function parseVersion(value: string): number[] | undefined {
  const clean = value.trim().replace(/^v/u, "").split("-")[0];
  if (!clean || !/^\d+(?:\.\d+){0,3}$/u.test(clean)) return undefined;
  return clean.split(".").map(Number);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const left = parseVersion(candidate);
  const right = parseVersion(current);
  if (!left || !right) return false;
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

export function initialUpdateState(currentVersion: string, mode: UpdateMode): UpdateStateUI {
  return { currentVersion, mode, status: "idle" };
}

export function releaseNotesToText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 4_000);
  if (Array.isArray(value)) {
    const text = value
      .flatMap((item) =>
        typeof item === "object" && item !== null && "note" in item
          ? [String((item as { note: unknown }).note)]
          : [],
      )
      .join("\n\n")
      .trim();
    return text ? text.slice(0, 4_000) : undefined;
  }
  return undefined;
}
