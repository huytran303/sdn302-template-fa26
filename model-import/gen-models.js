// Usage: node gen-models.js <folder-with-json> > models.js
// Infers Mongoose schemas/models from MongoDB Extended JSON exports (array, single doc or NDJSON).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dir = process.argv[2] || ".";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const NUMBER_KEYS = ["$numberInt", "$numberLong", "$numberDouble", "$numberDecimal"];
const SKIPPED_FILES = ["package.json", "package-lock.json"];
// Model names that would shadow a global used by generated or exam code
const RESERVED_MODELS = new Set(["Schema", "Date", "Number", "String", "Boolean", "Array", "Object", "Map", "Set", "Buffer", "Promise", "Error", "JSON", "Math", "Function", "Symbol", "RegExp"]);
// Fields Mongoose cannot declare: loading the model throws or the value is lost
const UNDECLARABLE_FIELDS = new Set(["__proto__", "constructor", "prototype", "hasOwnProperty", "markModified", "toObject", "toJSON"]);
// Fields whose nested form crashes Mongoose but which work as Mixed
const NO_NESTED_FIELDS = new Set(["schema", "id"]);
const IRREGULAR = new Map([["people", "person"], ["children", "child"], ["men", "man"], ["women", "woman"], ["statuses", "status"], ["buses", "bus"], ["news", "news"], ["series", "series"], ["species", "species"]]);

function fail(message) {
  console.error(`gen-models: ${message}`);
  process.exit(1);
}

// ponytail: naive English singular plus a small irregular list; rename by hand if odd
const singular = (s) => IRREGULAR.get(s.toLowerCase())
  ?? (/(ss|us|is)$/i.test(s) ? s : s.replace(/([^aeiouvk])ies$/, "$1y").replace(/(ss|sh|ch|x)es$/, "$1").replace(/([^s])s$/, "$1"));
const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const quoteKey = (k) => (/^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(k) ? k : JSON.stringify(k));

// "order-items" -> "orderItems", "1st" -> "_1st"
function identifier(s) {
  const camel = s.split(/[^\p{ID_Continue}$]+/u).filter(Boolean).map((w, i) => (i ? pascal(w) : w)).join("");
  return /^[\p{ID_Start}_$]/u.test(camel) ? camel : `_${camel}`;
}

const usedNames = new Set(["mongoose", "Schema", "module", "require"]);
function uniqueName(base) {
  let name = base;
  for (let n = 2; usedNames.has(name); n++) name = `${base}${n}`;
  usedNames.add(name);
  return name;
}

function readDocs(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  let docs;
  try {
    docs = [].concat(JSON.parse(text));
  } catch (error) {
    try {
      docs = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line)); // NDJSON
    } catch {
      fail(`${path.basename(file)}: invalid JSON: ${error.message}`);
    }
  }
  if (!docs.every((d) => d && typeof d === "object" && !Array.isArray(d))) fail(`${path.basename(file)}: every document must be an object`);
  return docs;
}

// Load every collection: { name, model, schemaVar, docs }
const collections = fs.readdirSync(dir)
  .filter((f) => f.endsWith(".json") && !SKIPPED_FILES.includes(f))
  .map((f) => {
    const name = path.basename(f, ".json").split(".").pop(); // "spr25db.movies.json" -> "movies"
    const base = pascal(singular(identifier(name)));
    const model = uniqueName(RESERVED_MODELS.has(base) ? `${base}Model` : base);
    const schemaVar = uniqueName(`${model.charAt(0).toLowerCase()}${model.slice(1)}Schema`);
    return { file: f, name, model, schemaVar, docs: readDocs(path.join(dir, f)) };
  });
if (!collections.length) fail(`no .json files found in ${dir}`);
for (const c of collections) {
  const other = collections.find((o) => o !== c && o.name === c.name);
  if (other) fail(`${c.file} and ${other.file} both map to collection "${c.name}"; keep only one`);
}

// Numbers and strings are different BSON ids; hex strings may still point at an ObjectId
function idKey(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return `n:${v}`;
  if (typeof v !== "object") return `s:${v}`;
  if ("$oid" in v) return `s:${v.$oid}`;
  const key = NUMBER_KEYS.find((k) => k in v);
  return key ? `n:${Number(v[key])}` : null;
}

// _id value -> set of owning model names, used to detect refs
const idOwners = new Map();
for (const c of collections) for (const d of c.docs) {
  const id = idKey(d._id);
  if (id === null) continue;
  if (!idOwners.has(id)) idOwners.set(id, new Set());
  idOwners.get(id).add(c.model);
}

// "authorId" | "author_id" | "authors" point at model Author; "createdByUser" points at User
function nameMatches(fieldName, model) {
  const hint = singular(fieldName.replace(/_?ids?$/i, "")).replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  return hint !== "" && hint.endsWith(model.toLowerCase());
}

function refFor(values, fieldName, isOid) {
  if (fieldName === "_id") return null;
  const owners = values.map((v) => idOwners.get(idKey(v)) || new Set());
  // An ObjectId is unique enough to trust alone; ignore dangling ids
  // A string/number can match by accident: it must match every value and the field name
  const candidates = isOid
    ? [...new Set(owners.flatMap((set) => [...set]))]
    : [...owners[0]].filter((m) => owners.every((set) => set.has(m)) && nameMatches(fieldName, m));
  if (candidates.length === 1) return candidates[0];
  const named = candidates.filter((m) => nameMatches(fieldName, m));
  return named.length === 1 ? named[0] : null;
}

const subSchemas = new Map(); // schema source -> var name, emitted before the main schemas

function kindOf(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "object") {
    if ("$oid" in v) return "oid";
    if ("$date" in v) return "date";
    if (["NaN", "Infinity", "-Infinity"].includes(v.$numberDouble ?? v.$numberDecimal)) return "mixed"; // Number would reject these
    if (NUMBER_KEYS.some((k) => k in v)) return "number";
    if ("$binary" in v) return "binary";
    if (Object.keys(v).some((k) => k.startsWith("$"))) return "mixed"; // $timestamp, $regularExpression, $uuid...
    return "object";
  }
  return typeof v; // string | number | boolean
}

// Infer a type expression from all sample values of one field
function inferType(values, fieldName) {
  const present = values.filter((v) => kindOf(v) !== "null");
  if (!present.length) return "Schema.Types.Mixed /* always null in the sample: set the real type by hand */";
  const kinds = new Set(present.map(kindOf));
  if (kinds.size > 1) return "Schema.Types.Mixed";
  const kind = [...kinds][0];

  if (kind === "oid") {
    const ref = refFor(present, fieldName, true);
    return ref ? `{ type: Schema.Types.ObjectId, ref: "${ref}" }` : "Schema.Types.ObjectId";
  }
  if (kind === "string" || kind === "number") {
    const type = kind === "string" ? "String" : "Number";
    const ref = refFor(present, fieldName, false);
    if (ref) return `{ type: ${type}, ref: "${ref}" }`;
    if (kind === "string" && present.every((v) => ISO_DATE.test(v))) {
      return "String /* ISO date stored as text: pass .toISOString() to filters and create(), aggregate with $toDate */";
    }
    // ponytail: Number keeps API output plain (Decimal128 serializes as {"$numberDecimal":...}); it loses digits past 2^53
    if (present.some((v) => typeof v === "object" && "$numberDecimal" in v)) {
      return "Number /* Decimal128 in Mongo: reads as a JS number, saving an edit stores a double */";
    }
    return type;
  }
  if (kind === "boolean") return "Boolean";
  if (kind === "date") return "Date";
  if (kind === "binary") return "Buffer";
  if (kind === "mixed") return "Schema.Types.Mixed";
  if (kind === "array") {
    const items = present.flat().filter((v) => kindOf(v) !== "null");
    if (!items.length) return "[]";
    if (items.every((i) => kindOf(i) === "object")) return `[${makeSubSchema(items, fieldName)}]`;
    return `[${inferType(items, fieldName)}]`;
  }
  if (NO_NESTED_FIELDS.has(fieldName)) return "Schema.Types.Mixed";
  // nested object: subschema if it has its own _id or is named `type` (inline, Mongoose would add an _id), otherwise inline
  if (fieldName === "type" || present.some((o) => "_id" in o)) return makeSubSchema(present, fieldName);
  return fieldsBlock(present, "  ");
}

function fieldsBlock(docs, indent) {
  const keys = [...new Set(docs.flatMap(Object.keys))];
  const lines = keys.map((k) => {
    if (k.includes(".") || UNDECLARABLE_FIELDS.has(k)) {
      console.error(`gen-models: warning: field ${JSON.stringify(k)} cannot be declared in a schema, skipped`);
      return `${indent}  // ${JSON.stringify(k)} skipped: Mongoose cannot declare it, read it with .lean()`;
    }
    const t = inferType(docs.map((d) => d[k]), k);
    // a bare `type` key would be read by Mongoose as the parent's type declaration
    return `${indent}  ${quoteKey(k)}: ${k === "type" && !t.startsWith("{ type: ") ? `{ type: ${t} }` : t},`;
  });
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function schemaOptions(docs, noId) {
  const opts = [];
  if (noId) opts.push("_id: false");
  if (JSON.stringify(docs).includes("{}")) opts.push("minimize: false"); // keep empty objects in the output
  return opts.length ? `, { ${opts.join(", ")} }` : "";
}

function makeSubSchema(docs, fieldName) {
  // data has no _id on elements -> stop Mongoose from adding one
  const opts = schemaOptions(docs, !docs.some((d) => "_id" in d));
  const src = `new Schema(${fieldsBlock(docs, "")}${opts})`;
  if (!subSchemas.has(src)) subSchemas.set(src, uniqueName(`${singular(identifier(fieldName))}SubSchema`));
  return subSchemas.get(src);
}

function schemaFor(c) {
  // Mongoose adds a default ObjectId _id and __v by itself; declare _id only when the data differs
  const defaultId = c.docs.every((d) => !("_id" in d) || (d._id && d._id.$oid));
  const docs = c.docs.map(({ __v, ...rest }) => {
    if (defaultId) delete rest._id;
    return rest;
  });
  return `${fieldsBlock(docs, "")}${schemaOptions(docs, false)}`;
}

const schemas = collections.map((c) => `const ${c.schemaVar} = new Schema(${schemaFor(c)});`);
const models = collections.map((c) => `const ${c.model} = mongoose.model(${JSON.stringify(c.model)}, ${c.schemaVar}, ${JSON.stringify(c.name)});`);

const output = `const mongoose = require("mongoose");
const Schema = mongoose.Schema;

${[...[...subSchemas].map(([src, v]) => `const ${v} = ${src};`), ...schemas].join("\n\n")}

${models.join("\n")}

module.exports = { ${collections.map((c) => c.model).join(", ")} };`;

try {
  new vm.Script(output); // never hand back a file that cannot even be parsed
} catch (error) {
  fail(`generated code is invalid: ${error.message}`);
}
console.log(output);
