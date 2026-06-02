export const vars = {
  values: new Map<string, string>([
    ["OWNER_EMAIL", "owner@youware.com"],
    ["DAILY_LLM_BUDGET_USD", "0.02"],
  ]),
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  },
};

export const secret = {
  values: new Map<string, string>([
    ["MGMT_TOKEN_SECRET", "test-management-secret"],
    ["RENOISE_TOKEN_SECRET", "test-renoise-secret"],
  ]),
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  },
};

export const ctx = {
  environment: "dev",
  // Records offloaded promises so tests can deterministically await background work (async
  // imagegen, auto-description, event writes). Mirrors the real waitUntil settling them.
  _background: [] as Promise<unknown>[],
  runInBackground(promise: Promise<unknown>) {
    ctx._background.push(promise);
  },
  async _drainBackground() {
    while (ctx._background.length) {
      const batch = ctx._background.splice(0);
      await Promise.allSettled(batch);
    }
  },
};

type Row = Record<string, any>;
const tables = new Map<string, Row[]>();

function tableName(table: any): string {
  return table?._?.name ?? table?.[Symbol.for("drizzle:Name")] ?? table?.name ?? "unknown";
}

function rowsFor(table: any): Row[] {
  const name = tableName(table);
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name)!;
}

export const db = {
  _tables: tables,
  _reset() {
    tables.clear();
  },
  _seed(table: any, rows: Row[]) {
    tables.set(tableName(table), rows.map((row) => ({ ...row })));
  },
  select() {
    let source: any;
    let predicate: any;
    return {
      from(table: any) {
        source = table;
        return this;
      },
      where(cond: any) {
        predicate = cond;
        return this;
      },
      limit(n: number) {
        return Promise.resolve(applyWhere(rowsFor(source), predicate).slice(0, n));
      },
      then(resolve: any, reject: any) {
        return Promise.resolve(applyWhere(rowsFor(source), predicate)).then(resolve, reject);
      },
    };
  },
  insert(table: any) {
    return {
      values(value: Row) {
        rowsFor(table).push({ ...value });
        return Promise.resolve();
      },
    };
  },
  update(table: any) {
    return {
      set(update: Row) {
        return {
          where(cond: any) {
            const rows = rowsFor(table);
            const matched = applyWhere(rows, cond);
            for (const row of matched) Object.assign(row, update);
            return Promise.resolve({ rowsAffected: matched.length, changes: matched.length, meta: { changes: matched.length } });
          },
        };
      },
    };
  },
};

type PutCall = { bucket: string; path: string; size: number; contentType?: string };
type StoredObject = { path: string; size: number; uploadedAt: Date; body: ArrayBuffer; contentType?: string };

export const storage = {
  // Records every put() so tests can assert bytes were actually persisted.
  _puts: [] as PutCall[],
  // Queryable object store per bucket, so list()/delete() (GC) behave like real R2.
  _objects: new Map<string, Map<string, StoredObject>>(),
  _resetPuts() {
    this._puts = [];
    this._objects = new Map();
  },
  _seedObject(bucketName: string, path: string, size = 1, uploadedAt = new Date(0), contentType = "application/octet-stream") {
    if (!this._objects.has(bucketName)) this._objects.set(bucketName, new Map());
    this._objects.get(bucketName)!.set(path, { path, size, uploadedAt, body: new ArrayBuffer(size), contentType });
  },
  // Mirrors the real client: canonical scheme is `s3://<bucket_name>/<path>`.
  createS3Uri(bucket: any, path: string) {
    return `s3://${bucket?.bucket_name ?? bucket}/${path}`;
  },
  tryParseS3Uri(uri: string) {
    if (typeof uri !== "string" || !uri.startsWith("s3://")) return null;
    const rest = uri.slice(5);
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    const name = rest.slice(0, slash);
    return { bucket: { bucket_name: name, description: "" }, path: rest.slice(slash + 1) };
  },
  parseS3Uri(uri: string) {
    const parsed = this.tryParseS3Uri(uri);
    if (!parsed) throw new Error("invalid_s3_uri");
    return parsed;
  },
  from(bucket: any) {
    const bucketName = bucket?.bucket_name ?? String(bucket);
    const puts = this._puts;
    const objects = this._objects;
    const objMap = () => {
      if (!objects.has(bucketName)) objects.set(bucketName, new Map());
      return objects.get(bucketName)!;
    };
    return {
      put(path: string, body: ArrayBuffer | ArrayBufferView, options?: { contentType?: string }) {
        const size = body instanceof ArrayBuffer ? body.byteLength : (body as ArrayBufferView).byteLength;
        const copy = body instanceof ArrayBuffer
          ? body.slice(0)
          : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
        puts.push({ bucket: bucketName, path, size, contentType: options?.contentType });
        objMap().set(path, { path, size, uploadedAt: new Date(0), body: copy, contentType: options?.contentType });
        return Promise.resolve();
      },
      get(path: string) {
        const object = objMap().get(path);
        if (!object) return Promise.resolve(null);
        return Promise.resolve({
          body: object.body.slice(0),
          metadata: { size: object.size, contentType: object.contentType },
        });
      },
      createPresignedGetUrl(path: string, _expiresInSecs?: number) {
        return Promise.resolve({ downloadUrl: `https://signed.test/${encodeURIComponent(path)}`, expiresAt: new Date(0) });
      },
      list(options?: { prefix?: string; limit?: number; cursor?: string }) {
        const prefix = options?.prefix ?? "";
        const files = [...objMap().values()].filter((o) => o.path.startsWith(prefix));
        return Promise.resolve({ files, hasMore: false, cursor: undefined, delimitedPrefixes: [] });
      },
      delete(paths: string | readonly string[]) {
        const list = typeof paths === "string" ? [paths] : paths;
        for (const p of list) objMap().delete(p);
        return Promise.resolve();
      },
    };
  },
};

function applyWhere(rows: Row[], cond: any): Row[] {
  if (!cond) return rows;
  if (typeof cond === "function") return rows.filter(cond);
  if (cond?.queryChunks) {
    const comparisons = collectComparisons(cond);
    if (!comparisons.length) return rows;
    return rows.filter((row) => comparisons.every(({ key, value }) => row[key] === value));
  }
  return rows;
}

function collectComparisons(sql: any): Array<{ key: string; value: unknown }> {
  const chunks = sql?.queryChunks;
  if (!Array.isArray(chunks)) return [];
  const nested = chunks.flatMap((chunk) => collectComparisons(chunk));
  const direct: Array<{ key: string; value: unknown }> = [];
  for (let i = 0; i < chunks.length - 2; i += 1) {
    const col = chunks[i];
    const op = chunks[i + 1];
    const param = chunks[i + 2];
    const opText = Array.isArray(op?.value) ? op.value.join("") : "";
    if (typeof col?.name === "string" && opText.trim() === "=" && param && "value" in param) {
      direct.push({ key: columnKey(col.name), value: param.value });
    }
  }
  return [...nested, ...direct];
}

function columnKey(name: string): string {
  return name.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}
