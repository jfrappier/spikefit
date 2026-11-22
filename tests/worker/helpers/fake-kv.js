// Minimal in-memory stand-in for a Workers KV namespace, covering exactly the
// surface cloudflare/worker.js uses: get, getWithMetadata, put (metadata,
// expiration, expirationTtl), delete, and list (prefix, cursor, limit, with
// per-key metadata). Keys list in lexicographic order, like the real thing.

export class FakeKV {
  constructor(initial = {}) {
    this.store = new Map();
    for (const [k, v] of Object.entries(initial)) this.store.set(k, { value: v, metadata: null, expiration: null });
  }

  async get(key) {
    const e = this.store.get(key);
    return e ? e.value : null;
  }

  async getWithMetadata(key) {
    const e = this.store.get(key);
    return e ? { value: e.value, metadata: e.metadata } : { value: null, metadata: null };
  }

  async put(key, value, opts = {}) {
    if (opts.expiration !== undefined && opts.expiration < Math.floor(Date.now() / 1000) + 60) {
      throw new Error('KV PUT failed: expiration must be at least 60 seconds in the future');
    }
    this.store.set(key, {
      value: String(value),
      metadata: opts.metadata === undefined ? null : JSON.parse(JSON.stringify(opts.metadata)),
      expiration: opts.expiration ?? (opts.expirationTtl ? Math.floor(Date.now() / 1000) + opts.expirationTtl : null)
    });
  }

  async delete(key) {
    this.store.delete(key);
  }

  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const all = [...this.store.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = all.slice(start, start + limit);
    const done = start + limit >= all.length;
    return {
      keys: page.map(name => {
        const e = this.store.get(name);
        return { name, metadata: e.metadata ?? undefined, expiration: e.expiration ?? undefined };
      }),
      list_complete: done,
      cursor: done ? undefined : String(start + limit)
    };
  }

  // Every key, value and metadata blob as one string — for privacy scans.
  dump() {
    return [...this.store.entries()]
      .map(([k, e]) => `${k}\n${e.value}\n${JSON.stringify(e.metadata)}`)
      .join('\n');
  }
}
