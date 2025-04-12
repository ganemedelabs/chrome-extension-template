/**
 * @file Build script for Chrome Extensions using Webpack. Handles production bundling,
 * version synchronization, and deployment packaging. Performs the following actions:
 *
 * 1. Reads project configuration (package.json, webpack.config.js)
 * 2. Validates extension manifest (manifest.json) for required fields and formats
 *    - Extensions platform keys (manifest_version, name, version): Errors stop the build
 *    - Chrome Web Store keys (description, icons): Warnings allow build but prevent ZIP generation
 *    - Auto-adds manifest_version: 3 if missing; uses package.json name if manifest name is missing
 * 3. Synchronizes versions between package.json and manifest.json
 * 4. Creates distribution directory if missing
 * 5. Executes Webpack build
 * 6. Generates versioned ZIP archive of build artifacts if the version has changed and no warnings exist
 * 7. Manages .gitignore entries for generated ZIP files
 *
 * @module BuildScript
 * @requires child_process/execSync
 * @requires fs
 * @requires path
 * @requires archiver
 * @requires glob
 */

const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");
const archiver = require("archiver");
const glob = require("glob");

const RED = "\x1b[1;31m";
const GREEN = "\x1b[1;32m";
const BLUE = "\x1b[1;34m";
const RESET = "\x1b[0m";

function red(text) {
    return `${RED}${text}${RESET}`;
}

function green(text) {
    return `${GREEN}${text}${RESET}`;
}

function blue(text) {
    return `${BLUE}${text}${RESET}`;
}

/**
 * Validates the manifest.json for required fields and formats.
 * @param {object} manifestJson - Parsed manifest.json content
 * @param {object} packageJson - Parsed package.json content
 * @param {string} manifestPath - Path to manifest.json
 * @returns {object} { errors: string[], warnings: string[] }
 */
function validateManifest(manifestJson, packageJson, manifestPath) {
    let errors = [];
    let warnings = [];
    let needsSave = false;

    if (!("manifest_version" in manifestJson)) {
        manifestJson.manifest_version = 3;
        needsSave = true;
        console.log("ℹ️  Added manifest_version: 3");
    } else if (typeof manifestJson.manifest_version !== "number" || manifestJson.manifest_version !== 3) {
        errors.push("manifest_version must be the integer 3");
    }

    if (!("name" in manifestJson)) {
        if (packageJson.name && typeof packageJson.name === "string") {
            manifestJson.name = packageJson.name;
            needsSave = true;
            console.log(`ℹ️  Added name from package.json: ${packageJson.name}`);
        } else {
            errors.push("Missing required 'name' field");
        }
    } else {
        if (typeof manifestJson.name !== "string") {
            errors.push("'name' must be a string");
        } else if (manifestJson.name.length > 75) {
            errors.push(`'name' exceeds 75 characters (current: ${manifestJson.name.length})`);
        }
    }

    if (!("version" in manifestJson)) {
        errors.push("Missing required 'version' field");
    } else {
        const versionParts = String(manifestJson.version).split(".");
        if (versionParts.length < 1 || versionParts.length > 4) {
            errors.push("Version must have 1 to 4 dot-separated integers");
        } else {
            let allZero = true;
            for (const part of versionParts) {
                if (!/^\d+$/.test(part)) {
                    errors.push("Version parts must be integers");
                    break;
                }
                const num = parseInt(part, 10);
                if (num !== 0) allZero = false;
                if (num < 0 || num > 65535) {
                    errors.push("Version integers must be between 0 and 65535");
                    break;
                }
                if (num !== 0 && part.startsWith("0")) {
                    errors.push("Non-zero version integers cannot start with 0");
                    break;
                }
            }
            if (allZero) {
                errors.push("Version cannot be all zeros (e.g., 0 or 0.0.0.0)");
            }
        }
    }

    if (!("description" in manifestJson)) {
        warnings.push("Missing 'description' field required by Chrome Web Store");
    } else {
        if (typeof manifestJson.description !== "string") {
            warnings.push("'description' must be a string");
        } else if (manifestJson.description.length > 132) {
            warnings.push(`'description' exceeds 132 characters (current: ${manifestJson.description.length})`);
        }
    }

    if (!("icons" in manifestJson)) {
        warnings.push("Missing 'icons' field required by Chrome Web Store");
    } else {
        if (typeof manifestJson.icons !== "object" || Array.isArray(manifestJson.icons)) {
            warnings.push("'icons' must be an object");
        } else {
            if (!manifestJson.icons["128"]) {
                warnings.push("Missing required 128x128 icon in 'icons' object");
            }
            const supportedFormats = [".png", ".bmp", ".gif", ".ico", ".jpg", ".jpeg"];
            for (const [size, iconPath] of Object.entries(manifestJson.icons)) {
                if (typeof iconPath !== "string") {
                    warnings.push(`Icon path for size ${size} must be a string`);
                } else if (!supportedFormats.some((format) => iconPath.toLowerCase().endsWith(format))) {
                    warnings.push(
                        `Icon path for size ${size} must end in supported format (${supportedFormats.join(", ")})`
                    );
                }
            }
        }
    }

    if (needsSave) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2));
        console.log("ℹ️  Updated manifest.json with added fields");
    }

    return { errors, warnings };
}

/**
 * Prints Webpack output with a prefixed label.
 * @param {string} output - Webpack stdout or stderr
 */
function printWebpackOutput(output) {
    const webpackPrefix = blue("WEBPACK ");
    output.split("\n").forEach((line) => {
        if (line.trim()) console.log(webpackPrefix + line);
    });
}

/**
 * Compares two version strings (e.g., "1.2.3" vs "1.2.4").
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const a = parts1[i] || 0;
        const b = parts2[i] || 0;
        if (a > b) return 1;
        if (a < b) return -1;
    }
    return 0;
}

/**
 * Loads and parses configuration files.
 * @returns {object} Configuration data
 */
function loadConfigs() {
    const packageJsonPath = path.join(__dirname, "package.json");
    if (!fs.existsSync(packageJsonPath)) throw new Error(`File ${green("package.json")} not found`);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    const webpackConfigPath = path.join(__dirname, "webpack.config.js");
    let webpackConfig = { output: { path: path.join(__dirname, "dist") } };
    if (fs.existsSync(webpackConfigPath)) {
        webpackConfig = require(webpackConfigPath);
    } else {
        console.warn(`⚠️  ${green("webpack.config.js")} not found. Using default configuration.`);
    }

    const outputDir = webpackConfig.output?.path || path.join(__dirname, "dist");
    let staticFolder = "static";
    if (webpackConfig.plugins) {
        for (const plugin of webpackConfig.plugins) {
            if (plugin.constructor?.name === "CopyWebpackPlugin") {
                const patterns = plugin.patterns || plugin.options?.patterns;
                if (patterns?.[0]?.from) {
                    staticFolder = patterns[0].from;
                    break;
                }
            }
        }
    }

    const manifestJsonPath = path.join(__dirname, staticFolder, "manifest.json");
    if (!fs.existsSync(manifestJsonPath))
        throw new Error(`Manifest file ${green("manifest.json")} not found at ${manifestJsonPath}`);
    const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, "utf8"));

    return { packageJson, outputDir, staticFolder, manifestJson, manifestJsonPath };
}

/**
 * Synchronizes versions between package.json and manifest.json.
 * @param {object} packageJson - Parsed package.json
 * @param {object} manifestJson - Parsed manifest.json
 * @param {string} packageJsonPath - Path to package.json
 * @param {string} manifestJsonPath - Path to manifest.json
 * @returns {string} Highest version
 */
function synchronizeVersions(packageJson, manifestJson, packageJsonPath, manifestJsonPath) {
    const pkgVersion = packageJson.version;
    const manVersion = manifestJson.version;
    const highestVersion = compareVersions(pkgVersion, manVersion) >= 0 ? pkgVersion : manVersion;

    if (compareVersions(pkgVersion, highestVersion) < 0) {
        packageJson.version = highestVersion;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log(`🆕 Updated ${green("package.json")} version to ${highestVersion}`);
    }
    if (compareVersions(manVersion, highestVersion) < 0) {
        manifestJson.version = highestVersion;
        fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2));
        console.log(`🆕 Updated ${green("manifest.json")} version to ${highestVersion}`);
    }
    return highestVersion;
}

/**
 * Runs the Webpack build process.
 */
function runWebpackBuild() {
    console.log("🚀 Running webpack build...");
    try {
        const output = execSync("npx webpack", { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
        printWebpackOutput(output);
    } catch (error) {
        if (error.stdout) printWebpackOutput(error.stdout);
        if (error.stderr) printWebpackOutput(error.stderr);
        throw new Error(red("❌ Webpack build failed"));
    }
}

/**
 * Creates a ZIP archive of the output directory.
 * @param {string} outputDir - Build output directory
 * @param {string} zipFilePath - Path for the ZIP file
 */
async function createZipArchive(outputDir, zipFilePath) {
    console.log(`📦 Creating ZIP archive: ${green(path.basename(zipFilePath))}`);
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    const archivePromise = new Promise((resolve, reject) => {
        output.on("close", () => {
            console.log(`✅ ZIP file ${green(path.basename(zipFilePath))} created (${archive.pointer()} bytes)`);
            resolve();
        });
        archive.on("error", (err) => reject(err));
    });

    archive.pipe(output);
    archive.directory(outputDir, false);
    archive.finalize();
    await archivePromise;
}

/**
 * Updates .gitignore to ignore ZIP files.
 * @param {string} packageName - Extension name
 */
function manageGitignore(packageName) {
    const gitignorePath = path.join(__dirname, ".gitignore");
    const zipIgnorePattern = `\n\n# Generated by build.js\n${packageName}-*.zip\n`;
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
        if (!gitignoreContent.includes(zipIgnorePattern.trim())) {
            fs.appendFileSync(gitignorePath, zipIgnorePattern);
            console.log(`📝 Added ZIP ignore pattern to ${green(".gitignore")}`);
        }
    } else {
        fs.writeFileSync(gitignorePath, zipIgnorePattern);
        console.log(`📝 Created ${green(".gitignore")} with ZIP ignore pattern`);
    }
}

/**
 * Main build script orchestrator.
 */
async function main() {
    try {
        // Load configurations
        const { packageJson, outputDir, manifestJson, manifestJsonPath } = loadConfigs();

        // Validate manifest
        const { errors, warnings } = validateManifest(manifestJson, packageJson, manifestJsonPath);

        if (errors.length > 0) {
            console.error(red("❌ Manifest validation failed with errors:"));
            errors.forEach((error) => console.error(red(`  - ${error}`)));
            process.exit(1);
        }

        if (warnings.length > 0) {
            console.warn("⚠️ Manifest validation warnings:");
            warnings.forEach((warning) => console.warn(`  - ${warning}`));
        }

        // Synchronize versions
        const highestVersion = synchronizeVersions(
            packageJson,
            manifestJson,
            path.join(__dirname, "package.json"),
            manifestJsonPath
        );

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`📁 Created output directory: ${green(outputDir)}`);
        }

        // Run Webpack build
        runWebpackBuild();

        // If there are no warnings, generate ZIP
        if (warnings.length === 0) {
            // Determine ZIP file details
            const packageName = manifestJson.name.toLowerCase().replace(/\s+/g, "-");
            const formattedVersion = `v${highestVersion.replace(/\./g, "-")}`;
            const zipFileName = `${packageName}-${formattedVersion}.zip`;
            const zipFilePath = path.join(__dirname, zipFileName);

            // Create ZIP if it doesn't exist
            if (!fs.existsSync(zipFilePath)) {
                await createZipArchive(outputDir, zipFilePath);
                const oldZips = glob.sync(`${packageName}-v*.zip`).filter((file) => file !== zipFileName);
                oldZips.forEach((file) => fs.unlinkSync(file));
                if (oldZips.length > 0) {
                    console.log(`🗑️  Removed ${oldZips.length} old ZIP file(s)`);
                }
                manageGitignore(packageName);
            } else {
                console.log(`✅ ZIP ${green(zipFileName)} for current version exists. Version unchanged.`);
            }
        } else {
            console.log("⚠️ Skipping ZIP generation due to manifest warnings.");
        }

        console.log("🎉 Build completed successfully.");
    } catch (error) {
        console.error(red(`❌ Error: ${error.message}`));
        process.exit(1);
    }
}

main();
