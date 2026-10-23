import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(appRoot);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npx", ["prisma", "generate", "--schema=./prisma/schema.prisma"]);
run("npx", ["next", "build"]);
