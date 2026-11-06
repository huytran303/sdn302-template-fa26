// Usage (run from the solution folder, so that its node_modules and .env are found):
//   node path/to/import-json.js <folder-with-json> [mongo-uri]
// Each <name>.json becomes collection <name> (dropped and re-inserted), with Extended JSON types kept.
// Uses MONGO_URI from .env when no uri is given. Every file is parsed before the database is touched.
const fs = require("fs");
const path = require("path");

const SKIPPED_FILES = ["package.json", "package-lock.json"];

function fail(message) {
  console.error(`import-json: ${message}`);
  process.exit(1);
}

function loadMongoose() {
  try {
    return require(require.resolve("mongoose", { paths: [process.cwd(), __dirname] }));
  } catch {
    return fail("mongoose not found: run this from the solution folder after npm install");
  }
}

function readDocs(file, EJSON) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  // relaxed: false keeps int/long/double/decimal as exported, but it rejects legacy {"$date": <millis>}
  const parse = (json) => EJSON.deserialize(
    JSON.parse(json, (key, value) => (key === "$date" && typeof value === "number" ? { $numberLong: String(value) } : value)),
    { relaxed: false },
  );
  let docs;
  try {
    docs = [].concat(parse(text));
  } catch (error) {
    try {
      docs = text.split(/\r?\n/).filter((line) => line.trim()).map(parse); // NDJSON
    } catch {
      fail(`${path.basename(file)}: invalid JSON: ${error.message}. Nothing was imported.`);
    }
  }
  if (!docs.every((d) => d && typeof d === "object" && !Array.isArray(d))) {
    fail(`${path.basename(file)}: every document must be an object. Nothing was imported.`);
  }
  return docs;
}

async function main() {
  const dir = process.argv[2] || ".";
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env here: the uri must come from the argument or the environment
  }
  const uri = process.argv[3] || process.env.MONGO_URI;
  if (!uri) fail("no database: pass a mongo uri or set MONGO_URI in .env");

  const mongoose = loadMongoose();
  const { EJSON } = mongoose.mongo.BSON;
  const collections = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !SKIPPED_FILES.includes(f))) {
    const name = path.basename(f, ".json").split(".").pop(); // "spr25db.movies.json" -> "movies"
    if (collections.has(name)) fail(`two files map to collection "${name}"; keep only one. Nothing was imported.`);
    collections.set(name, readDocs(path.join(dir, f), EJSON));
  }
  if (!collections.size) fail(`no .json files found in ${dir}`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    const { db } = mongoose.connection;
    console.log(`database: ${db.databaseName}`);
    for (const [name, docs] of collections) {
      await db.collection(name).drop().catch((error) => {
        if (error.code !== 26) throw error; // 26 = collection does not exist yet
      });
      if (docs.length) await db.collection(name).insertMany(docs);
      console.log(`${name}: ${docs.length} docs`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => fail(error.message));
