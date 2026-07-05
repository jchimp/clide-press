import { readFileSync, writeFileSync } from "fs";

// npm_package_version is set by `npm version`, which runs this script via the
// "version" lifecycle hook before committing the bump.
const targetVersion = process.env.npm_package_version;

// Read minAppVersion from manifest.json and bump its version to targetVersion.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// Map the new plugin version to the current minAppVersion in versions.json,
// so older Obsidian clients can resolve a compatible release.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
