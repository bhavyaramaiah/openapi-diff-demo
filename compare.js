#!/usr/bin/env node
import { exec } from "child_process";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to your YAML files
// const oldSpec = path.join(__dirname, "current.yml");
// const newSpec = path.join(__dirname, "new.yml");

// const oldSpec = `file://${oldSpec.replace(/\\/g, '/')}`;
// const newSpec = `file://${newSpec.replace(/\\/g, '/')}`;


// const oldSpec = pathToFileURL(path.resolve("current.yml")).href;
// const newSpec = pathToFileURL(path.resolve("new.yml")).href;

const oldSpec = "./current_oa3.yaml";
const newSpec = "./new_oa3.yaml";

// Command to run openapi-diff
const cmd = `npx openapi-diff ${oldSpec} ${newSpec}`;

console.log("🔍 Comparing OpenAPI specs...");
exec(cmd, (err, stdout, stderr) => {
  if (err) {
    console.error("❌ Breaking changes detected!");
    console.error(stdout || stderr);
    process.exit(1); // fail build if breaking
  } else {
    console.log("✅ No breaking changes found.");
    console.log(stdout);
  }
});
