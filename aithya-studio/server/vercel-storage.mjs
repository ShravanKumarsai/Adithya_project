import postgres from "postgres";

let sql;
function database() {
  if (!process.env.AITHYA_DATABASE_URL) throw new Error("Storage is unavailable.");
  return sql ??= postgres(process.env.AITHYA_DATABASE_URL, {
    ssl: "require",
    prepare: false,
    max: 2,
    connect_timeout: 8,
    idle_timeout: 10,
    connection: { application_name: "aithya-vercel", search_path: "aithya_runtime" },
  });
}

export const DB = {
  prepare(statement) {
    const query = statement
      .replace("INSERT OR IGNORE", "INSERT")
      .replace("SET attempts=attempts+1 WHERE attempts<",
        "SET attempts=planning_rate.attempts+1 WHERE planning_rate.attempts<")
      .replace(/INSERT INTO project_notes VALUES\(.+\)$/, "$& ON CONFLICT DO NOTHING");
    let position = 0;
    const text = query.replaceAll("?", () => "$" + ++position);
    return {
      bind(...params) {
        const execute = () => database().unsafe(text, params);
        return {
          first: async () => (await execute())[0] ?? null,
          run: async () => ({ meta: { changes: (await execute()).count } }),
        };
      },
    };
  },
};

export const FILES = {
  async list({prefix}) {
    const rows = await database()`select key, name, octet_length(bytes) as size
      from notebook_files where starts_with(key, ${prefix}) order by key`;
    return {objects: rows.map(({key, name, size}) => ({key, size, customMetadata:{name}}))};
  },
  async get(key) {
    const [row] = await database()`select bytes, name from notebook_files where key = ${key}`;
    return row && {body: row.bytes, customMetadata: {name:row.name}};
  },
  async put(key, bytes, {customMetadata:{name}}) {
    await database()`insert into notebook_files(key, bytes, name) values (${key}, ${Buffer.from(bytes)}, ${name})`;
  },
};

export async function storeScanPart(accountId, scanId, part, mime, bytes) {
  const db = database();
  await db`delete from rulebook_parts where created_at < now() - interval '15 minutes'`;
  await db`insert into rulebook_parts(account_id, part, scan_id, mime, bytes)
    values (${accountId}, ${part}, ${scanId}, ${mime}, ${bytes})
    on conflict (account_id, part) do update
    set scan_id = excluded.scan_id, mime = excluded.mime, bytes = excluded.bytes, created_at = now()`;
}

export async function consumeScan(accountId, scanId, mime) {
  const rows = await database()`delete from rulebook_parts
    where account_id = ${accountId} and scan_id = ${scanId} and mime = ${mime}
      and created_at >= now() - interval '15 minutes' returning part, bytes`;
  return rows.sort((a, b) => a.part - b.part);
}
