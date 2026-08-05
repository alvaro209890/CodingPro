import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/u, "$1");
const pkg = JSON.parse(readFileSync(join(repoRoot, "packages", "desktop", "package.json"), "utf8"));
const releaseDir = join(repoRoot, "packages", "desktop", ".pack", "release");
const setup = `CodingPro-Setup-${pkg.version}.exe`;
const portable = `CodingPro-portable-${pkg.version}.exe`;
const blockmap = `${setup}.blockmap`;
const releaseNotes =
  "PlanTracker com progresso real, markdown nos planos, anti-varredura de exploração, " +
  "inteligência Windows (cmd/Python), 10 tipos de subagente e comandos /subagentes e /executar.";

for (const file of [setup, portable, blockmap, "latest.yml"]) {
  if (!existsSync(join(releaseDir, file))) {
    throw new Error(`[desktop-metadata] artefato ausente: ${file}`);
  }
}

function details(name) {
  const path = join(releaseDir, name);
  return {
    name,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    size: statSync(path).size,
    url: `https://codingpro.cursar.space/downloads/${encodeURIComponent(name)}`,
  };
}

const setupDetails = details(setup);
const portableDetails = details(portable);
const blockmapDetails = details(blockmap);
const latestYmlPath = join(releaseDir, "latest.yml");
const latestYml = readFileSync(latestYmlPath, "utf8");
const releaseMetadataIndex = latestYml.search(/^release(?:Name|Notes):/mu);
const latestYmlBase = (
  releaseMetadataIndex >= 0 ? latestYml.slice(0, releaseMetadataIndex) : latestYml
).trimEnd();
writeFileSync(
  latestYmlPath,
  `${latestYmlBase}\nreleaseName: CodingPro Desktop ${pkg.version}\nreleaseNotes: |-\n  ${releaseNotes}\n`,
  "utf8",
);
const metadata = {
  version: pkg.version,
  publishedAt: new Date().toISOString(),
  notes: releaseNotes,
  setupUrl: setupDetails.url,
  portableUrl: portableDetails.url,
  files: { setup: setupDetails, portable: portableDetails, blockmap: blockmapDetails },
  bridgeFrom: "1.1.1",
  bridgeRequiresManualInstall: true,
};
writeFileSync(join(releaseDir, "latest.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log("[desktop-metadata] latest.json", pkg.version);
