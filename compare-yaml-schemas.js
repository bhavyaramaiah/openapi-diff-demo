#!/usr/bin/env node
/**
 * compare-yaml-schemas.js
 *
 * Compare two YAML files for:
 *  1) Field name changes (added/removed keys)
 *  2) Structural type changes (object/array/string/number/boolean/null)
 *  3) "type" keyword value changes (e.g., OpenAPI schema type changes)
 *
 * Usage:
 *  node compare-yaml-schemas.js Current.yml New.yml [--report report.json] [--quiet]
 *
 * Exit code:
 *  0 = no differences
 *  1 = differences found
 *  >1 = error
 */

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

function readYaml(filePath) {
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    return YAML.parse(txt, { prettyErrors: true });
  } catch (err) {
    die(`Failed to read/parse YAML: ${filePath}\n${err.message}`);
  }
}

function jsType(val) {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  return typeof val; // "object" | "string" | "number" | "boolean"
}

/**
 * Recursively compare two values and collect differences.
 * @param {*} a Old value
 * @param {*} b New value
 * @param {string} p Current path (dot/bracket notation)
 * @param {*} out Accumulator for findings
 * @param {object} opts Options
 */
function diff(a, b, p, out, opts) {
  const typeA = jsType(a);
  const typeB = jsType(b);

  // Structural type change at this node
  if (typeA !== typeB) {
    out.typeChanges.push({
      path: p || "(root)",
      from: typeA,
      to: typeB,
      kind: "structural",
    });
    return; // further deep compare isn't meaningful
  }

  // If this node is a "type" property (OpenAPI keyword), compare values directly
  const lastKey = p.split(".").pop();
  if (lastKey === "type" && (typeA === "string" || typeA === "array")) {
    const strA = JSON.stringify(a);
    const strB = JSON.stringify(b);
    if (strA !== strB) {
      out.typeKeywordChanges.push({
        path: p,
        from: a,
        to: b,
        note: 'Change in "type" keyword value',
      });
    }
    // keep going in case nested under "type" (rare), but return for leafs
  }

  // Object comparison
  if (typeA === "object") {
    const keysA = new Set(Object.keys(a || {}));
    const keysB = new Set(Object.keys(b || {}));

    // Added
    for (const k of keysB) {
      if (!keysA.has(k)) {
        out.fieldAdds.push({
          path: p ? `${p}.${k}` : k,
          newType: jsType(b[k]),
        });
      }
    }

    // Removed
    for (const k of keysA) {
      if (!keysB.has(k)) {
        out.fieldRemoves.push({
          path: p ? `${p}.${k}` : k,
          oldType: jsType(a[k]),
        });
      }
    }

    // Recurse common
    for (const k of keysA) {
      if (keysB.has(k)) {
        diff(a[k], b[k], p ? `${p}.${k}` : k, out, opts);
      }
    }
    return;
  }

  // Array comparison
  if (typeA === "array") {
    // Heuristic: compare element "schema" by first element type (best-effort).
    const aElemType = a.length ? jsType(a[0]) : "unknown";
    const bElemType = b.length ? jsType(b[0]) : "unknown";
    if (aElemType !== bElemType) {
      out.typeChanges.push({
        path: (p || "(root)") + "[]",
        from: `array<${aElemType}>`,
        to: `array<${bElemType}>`,
        kind: "array-element",
      });
    }

    // If first elements are objects, you can deep-compare representative structure:
    if (aElemType === "object" && bElemType === "object" && a[0] && b[0]) {
      diff(a[0], b[0], (p ? p : "(root)") + "[0]", out, opts);
    }
    return;
  }

  // Primitive (string | number | boolean | null)
  // If you want to flag numeric int/float differences, add a small check here.
  if (opts.detectNumericKind && typeA === "number" && typeB === "number") {
    // Could implement int vs float diff check
  }
}

/**
 * Pretty print a section if it has items.
 */
function printSection(title, items, formatItem) {
  if (!items || items.length === 0) return;
  console.log(`\n=== ${title} (${items.length}) ===`);
  for (const it of items) {
    console.log(formatItem(it));
  }
}

/**
 * CLI
 */
(function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log(
      "Usage: node compare-yaml-schemas.js <old.yml> <new.yml> [--report report.json] [--quiet]"
    );
    process.exit(2);
  }

  const oldPath = args[0];
  const newPath = args[1];
  const reportIdx = args.indexOf("--report");
  const quiet = args.includes("--quiet");
  const reportPath =
    reportIdx !== -1 ? args[reportIdx + 1] : null;

  if (!fs.existsSync(oldPath)) die(`File not found: ${oldPath}`);
  if (!fs.existsSync(newPath)) die(`File not found: ${newPath}`);

  const oldDoc = readYaml(oldPath);
  const newDoc = readYaml(newPath);

  const result = {
    fieldAdds: [],
    fieldRemoves: [],
    typeChanges: [],
    typeKeywordChanges: [],
  };

  const opts = { detectNumericKind: false };

  diff(oldDoc, newDoc, "", result, opts);

  if (!quiet) {
    console.log(`Comparing:\n  OLD: ${path.resolve(oldPath)}\n  NEW: ${path.resolve(newPath)}`);

    printSection("Field Additions", result.fieldAdds, (it) =>
      `+ ${it.path} (type: ${it.newType})`
    );
    printSection("Field Removals", result.fieldRemoves, (it) =>
      `- ${it.path} (was: ${it.oldType})`
    );
    printSection("Structural Type Changes", result.typeChanges, (it) =>
      `~ ${it.path} :: ${it.from} -> ${it.to} [${it.kind}]`
    );
    printSection('"type" Keyword Value Changes', result.typeKeywordChanges, (it) =>
      `~ ${it.path} :: ${JSON.stringify(it.from)} -> ${JSON.stringify(it.to)}`
    );

    if (
      result.fieldAdds.length === 0 &&
      result.fieldRemoves.length === 0 &&
      result.typeChanges.length === 0 &&
      result.typeKeywordChanges.length === 0
    ) {
      console.log("\nNo differences found ✅");
    } else {
      console.log("\nDifferences found ❗");
    }
  }

  if (reportPath) {
    try {
      fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
      if (!quiet) console.log(`\nWrote JSON report -> ${reportPath}`);
    } catch (err) {
      die(`Failed to write report: ${err.message}`);
    }
  }

  // Exit status: 0 if no diffs, 1 otherwise
  const hasDiff =
    result.fieldAdds.length ||
    result.fieldRemoves.length ||
    result.typeChanges.length ||
    result.typeKeywordChanges.length;

  process.exit(hasDiff ? 1 : 0);
})();
