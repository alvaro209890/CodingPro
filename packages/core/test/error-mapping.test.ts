import { describe, expect, it } from "vitest";
import { CoreError } from "../src/errors.js";
import { toReadError, toWriteError } from "../src/fs-safe.js";
import { kindOf, toListError } from "../src/tools/list-dir.js";

function errno(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe("toReadError", () => {
  it.each([
    ["ENOENT", "not-found"],
    ["ELOOP", "path-escape"],
    ["EISDIR", "not-a-file"],
    ["ENOTDIR", "not-a-file"],
    ["EACCES", "execution-failed"],
    ["EPERM", "execution-failed"],
    ["EMFILE", "execution-failed"],
  ])("mapeia %s para %s", (code, expected) => {
    expect(toReadError(errno(code)).code).toBe(expected);
  });

  it("preserva um CoreError já lançado e trata erro sem code", () => {
    const original = new CoreError("too-large", "grande");
    expect(toReadError(original)).toBe(original);
    expect(toReadError(new Error("sem code")).code).toBe("execution-failed");
  });
});

describe("toWriteError", () => {
  it.each([
    ["ELOOP", "path-escape"],
    ["EISDIR", "not-a-file"],
    ["EACCES", "execution-failed"],
    ["EPERM", "execution-failed"],
    ["ENOSPC", "execution-failed"],
  ])("mapeia %s para %s", (code, expected) => {
    expect(toWriteError(errno(code)).code).toBe(expected);
  });

  it("preserva um CoreError já lançado", () => {
    const original = new CoreError("too-large", "grande");
    expect(toWriteError(original)).toBe(original);
  });
});

describe("toListError", () => {
  it.each([
    ["ENOTDIR", "not-a-directory"],
    ["ENOENT", "not-found"],
    ["EACCES", "execution-failed"],
  ])("mapeia %s para %s", (code, expected) => {
    expect(toListError(errno(code)).code).toBe(expected);
  });
});

describe("kindOf", () => {
  const dirent = (over: Partial<Record<"dir" | "file" | "link", boolean>>) => ({
    isDirectory: () => over.dir === true,
    isFile: () => over.file === true,
    isSymbolicLink: () => over.link === true,
  });

  it("classifica cada tipo de entrada", () => {
    expect(kindOf(dirent({ link: true }))).toBe("link");
    expect(kindOf(dirent({ dir: true }))).toBe("dir");
    expect(kindOf(dirent({ file: true }))).toBe("file");
    expect(kindOf(dirent({}))).toBe("other");
  });
});
