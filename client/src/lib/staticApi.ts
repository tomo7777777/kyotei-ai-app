// GitHub版（静的ファイル）用: /api/... を書き出し済みのJSONファイルに置き換える
export const STATIC = import.meta.env.VITE_STATIC === "1";

function q(url: string) { const u = new URL(url, "http://x"); return { p: u.pathname, s: u.searchParams }; }

export function staticPath(url: string): string | null {
  const { p, s } = q(url);
  if (p === "/api/venues") return `api/venues/${s.get("hd")}.json`;
  if (p === "/api/race") return `api/race/${s.get("hd")}-${s.get("jcd")}-${s.get("rno")}.json`;
  if (p === "/api/ashi") return `api/ashi/${s.get("hd")}-${s.get("jcd")}-${s.get("rno")}.json`;
  if (p === "/api/ashi/venue") return `api/ashi/venue-${s.get("jcd")}.json`;
  if (p.startsWith("/api/racer/")) return `api/racer/${p.slice(11)}.json`;
  if (p.startsWith("/api/")) return `api/${p.slice(5)}.json`;
  return null;
}

const FKEY = "kyotei_favs_v1";
type F = { toban: string; name: string; cls: string; branch: string; memo: string; addedAt: string; updatedAt: string };
async function getJson(path: string) {
  const r = await fetch(`${path}?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 404 ? "404: GitHub版ではこのデータはまだ書き出されていません（当日分のみ対応）" : `${r.status}: 読み込みに失敗しました`);
  return r.json();
}
async function loadFavs(): Promise<F[]> {
  const v = localStorage.getItem(FKEY);
  if (v) { try { return JSON.parse(v); } catch {} }
  try { const d = await getJson("api/favorites.json"); localStorage.setItem(FKEY, JSON.stringify(d.favorites || [])); return d.favorites || []; } catch { return []; }
}
const saveFavs = (xs: F[]) => localStorage.setItem(FKEY, JSON.stringify(xs));

export async function staticGet(url: string): Promise<any> {
  const { p } = q(url);
  if (p === "/api/favorites") {
    const favorites = await loadFavs();
    let all: Record<string, any[]> = {}; try { all = await getJson("api/appear.json"); } catch {}
    const appearances: Record<string, any[]> = {};
    for (const f of favorites) if (all[f.toban]) appearances[f.toban] = all[f.toban];
    return { favorites, appearances };
  }
  if (p === "/api/myraces") return [];
  const path = staticPath(url); if (!path) throw new Error("404");
  return getJson(path);
}

export async function staticRequest(method: string, url: string, data?: any): Promise<Response> {
  const { p } = q(url);
  const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  if (p.startsWith("/api/favorites/")) {
    const t = p.slice(15); const xs = await loadFavs(); const now = new Date().toISOString(); const f = xs.find((x) => x.toban === t);
    if (method === "PUT") { if (f) Object.assign(f, { name: data?.name || f.name, cls: data?.cls || f.cls, branch: data?.branch || f.branch, updatedAt: now }); else xs.unshift({ toban: t, name: String(data?.name || ""), cls: String(data?.cls || ""), branch: String(data?.branch || ""), memo: "", addedAt: now, updatedAt: now }); saveFavs(xs); }
    else if (method === "PATCH") { if (f) { f.memo = String(data?.memo ?? "").slice(0, 2000); f.updatedAt = now; saveFavs(xs); } }
    else if (method === "DELETE") saveFavs(xs.filter((x) => x.toban !== t));
    return ok();
  }
  if (method === "GET") return new Response(JSON.stringify(await staticGet(url.replace(/&fresh=1$/, ""))), { headers: { "Content-Type": "application/json" } });
  throw new Error("GitHub版ではこの操作は使えません（データは約10分ごとに自動更新されます）");
}
