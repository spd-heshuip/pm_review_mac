import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const staging = join(root, "bundle-resources");
const nodeVersion = "v23.11.0";
const platformPackageVersion = "1.0.32";
const targetArch = process.env.PM_REVIEW_TARGET_ARCH === "arm64" ? "arm64" : "x64";
const hostArch = process.arch === "arm64" ? "arm64" : "x64";
const nodeName = `node-${nodeVersion}-darwin-${targetArch}`;
const cacheDir = join(staging, ".cache");

rmSync(join(staging, "dist"), { recursive: true, force: true });
rmSync(join(staging, "node_modules"), { recursive: true, force: true });
rmSync(join(staging, "node"), { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

writeFileSync(join(staging, "package.json"), JSON.stringify({ type: "module" }));
copyRuntime(join(root, "dist", "bridge"), join(staging, "dist", "bridge"));
copyRuntime(join(root, "dist", "core"), join(staging, "dist", "core"));

const listed = listProductionPackages();
for (const packageDir of listed) {
  const rel = relative(join(root, "node_modules"), packageDir);
  if (rel.startsWith("..") || rel === "@tauri-apps/api" || rel === "marked") continue;
  if (rel.startsWith("@cursor/sdk-darwin-") && rel !== `@cursor/sdk-darwin-${targetArch}`) continue;
  const destination = join(staging, "node_modules", rel);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(packageDir, destination, { recursive: true });
}

await ensurePlatformPackage(targetArch);
const nodeBinary = await stageNode();
chmodSync(nodeBinary, 0o755);
signIfPresent(nodeBinary);
signIfPresent(join(staging, "node_modules", "@cursor", `sdk-darwin-${targetArch}`, "bin", "rg"));
if (targetArch === hostArch) {
  execFileSync(nodeBinary, ["-e", "process.stdout.write(process.version)"]);
} else {
  const info = execFileSync("file", [nodeBinary], { encoding: "utf8" });
  if (!info.includes("arm64")) throw new Error(`expected an arm64 Node binary, got: ${info}`);
}
console.log(`staged runtime with ${nodeName}`);

function signIfPresent(path) {
  if (!existsSync(path)) return;
  chmodSync(path, 0o755);
  execFileSync("codesign", ["--force", "--sign", "-", path], { stdio: "ignore" });
}

function copyRuntime(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    filter: (path) => !path.endsWith(".test.js"),
  });
}

function listProductionPackages() {
  try {
    return execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line !== root);
  } catch (error) {
    const output = error.stdout?.toString() ?? "";
    const packages = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line !== root);
    if (packages.length > 0) return packages;
    throw error;
  }
}

async function ensurePlatformPackage(arch) {
  const destination = join(staging, "node_modules", "@cursor", `sdk-darwin-${arch}`);
  if (existsSync(join(destination, "package.json"))) return;
  mkdirSync(cacheDir, { recursive: true });
  const fileName = `sdk-darwin-${arch}-${platformPackageVersion}.tgz`;
  const archive = join(cacheDir, fileName);
  if (!existsSync(archive)) {
    const url = `https://mirrors.tencent.com/npm/@cursor/sdk-darwin-${arch}/-/${fileName}`;
    console.log(`downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`failed to download ${fileName}: ${response.status}`);
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  }
  const extractDir = join(cacheDir, `sdk-darwin-${arch}`);
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", extractDir]);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(extractDir, "package"), destination, { recursive: true });
}

async function stageNode() {
  mkdirSync(cacheDir, { recursive: true });
  const archive = join(cacheDir, `${nodeName}.tar.gz`);
  const extracted = join(cacheDir, nodeName);
  const sourceBinary = join(extracted, "bin", "node");
  if (!existsSync(sourceBinary)) {
    const url = `https://nodejs.org/dist/${nodeVersion}/${nodeName}.tar.gz`;
    console.log(`downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`failed to download Node.js: ${response.status} ${url}`);
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    execFileSync("tar", ["-xzf", archive, "-C", cacheDir, `${nodeName}/bin/node`]);
  }
  const destination = join(staging, "node", "bin", "node");
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(sourceBinary, destination);
  return destination;
}
