import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Star, Pencil, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export type Fav = { toban: string; name: string; cls: string; branch: string; memo: string; addedAt: string; updatedAt: string };
export type FavAppear = { hd: string; jcd: string; venue: string; rno: number; deadline: string | null; lane: number; status: string; place: number | null };
export type FavResp = { favorites: Fav[]; appearances: Record<string, FavAppear[]> };

export function useFavs() {
  const q = useQuery<FavResp>({ queryKey: ["/api/favorites"], staleTime: 30_000, refetchInterval: 120_000 });
  const inv = () => queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
  const add = useMutation({ mutationFn: (f: { toban: string; name: string; cls?: string; branch?: string }) => apiRequest("PUT", `/api/favorites/${f.toban}`, f), onSuccess: inv });
  const del = useMutation({ mutationFn: (toban: string) => apiRequest("DELETE", `/api/favorites/${toban}`), onSuccess: inv });
  const memo = useMutation({ mutationFn: (x: { toban: string; memo: string }) => apiRequest("PATCH", `/api/favorites/${x.toban}`, { memo: x.memo }), onSuccess: inv });
  const get = (toban: string) => q.data?.favorites.find((f) => f.toban === toban) ?? null;
  return { ...q, add, del, memo, get };
}

// 星ボタン: 押すとお気に入りに追加／もう一度押すと解除
export function FavStar({ toban, name, cls, branch, size = "md" }: { toban: string; name: string; cls?: string; branch?: string; size?: "sm" | "md" }) {
  const f = useFavs(); const on = !!f.get(toban);
  return (
    <button
      type="button"
      aria-label={on ? "お気に入りから外す" : "お気に入りに追加"}
      data-testid={`button-fav-${toban}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); on ? f.del.mutate(toban) : f.add.mutate({ toban, name, cls, branch }); }}
      className={cn("shrink-0 rounded-md p-1.5 transition-colors hover:bg-accent", on ? "text-amber-400" : "text-muted-foreground")}
    >
      <Star className={cn(size === "sm" ? "h-4 w-4" : "h-5 w-5", on && "fill-current")} />
    </button>
  );
}

// メモ（お気に入り登録済みの選手だけ）
export function FavMemo({ toban, compact = false }: { toban: string; compact?: boolean }) {
  const f = useFavs(); const fav = f.get(toban);
  const [edit, setEdit] = useState(false); const [v, setV] = useState(fav?.memo ?? "");
  useEffect(() => { if (!edit) setV(fav?.memo ?? ""); }, [fav?.memo, edit]);
  if (!fav) return null;
  if (!edit) return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEdit(true); }} className={cn("flex w-full items-start gap-1.5 rounded-md border border-dashed px-2 py-1 text-left text-xs hover:bg-accent/40", compact && "py-0.5")} data-testid={`button-memo-${toban}`}>
      <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
      {fav.memo ? <span className="whitespace-pre-wrap">{fav.memo}</span> : <span className="text-muted-foreground">メモを書く</span>}
    </button>
  );
  return (
    <div className="space-y-1.5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={3} maxLength={2000} placeholder="例：スタート早い。荒れた水面が得意。" className="w-full rounded-md border bg-background p-2 text-sm" data-testid={`input-memo-${toban}`} />
      <div className="flex gap-2">
        <button type="button" onClick={() => { f.memo.mutate({ toban, memo: v }); setEdit(false); }} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground" data-testid={`button-memo-save-${toban}`}><Check className="h-3.5 w-3.5" />保存</button>
        <button type="button" onClick={() => setEdit(false)} className="rounded-md border px-3 py-1 text-xs">やめる</button>
      </div>
    </div>
  );
}
