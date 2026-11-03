import { Link } from "wouter";
import { Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTitle, Boat } from "@/components/shell";
import { useFavs, FavStar, FavMemo } from "@/components/fav";

const todayHd = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");

export default function FavPage() {
  const { data, isLoading } = useFavs();
  const favs = data?.favorites ?? [];
  const t = todayHd();
  return (
    <div className="space-y-4">
      <SectionTitle sub="レース画面や選手の癖の画面で、選手名の横の星を押すと登録できます。もう一度押すと外れます。メモは選手ごとに書けて、レース画面にも表示されます。">お気に入り選手</SectionTitle>
      {isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : favs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          <Star className="mx-auto mb-2 h-6 w-6" />まだ登録がありません。レース画面の選手名の横にある星を押してください。
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {favs.map((f) => {
            const ap = data?.appearances[f.toban] ?? [];
            return (
              <div key={f.toban} className="rounded-xl border bg-card p-3" data-testid={`card-fav-${f.toban}`}>
                <div className="flex items-center gap-2">
                  <Link href={`/racer/${f.toban}`} className="min-w-0 flex-1">
                    <div className="truncate font-bold hover:text-primary">{f.name || f.toban} <span className="text-xs font-semibold text-muted-foreground">{f.cls}</span></div>
                    <div className="truncate text-[11px] text-muted-foreground">{f.toban}{f.branch ? `・${f.branch}` : ""}</div>
                  </Link>
                  <FavStar toban={f.toban} name={f.name} />
                </div>
                <div className="mt-2"><FavMemo toban={f.toban} /></div>
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-semibold text-muted-foreground">今日・明日の出走</div>
                  {ap.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ap.map((a) => (
                        <Link key={`${a.hd}-${a.jcd}-${a.rno}`} href={`/race/${a.hd}/${a.jcd}/${a.rno}`} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs hover:border-primary/50" data-testid={`link-fav-race-${f.toban}-${a.jcd}-${a.rno}`}>
                          <span className="text-[10px] text-muted-foreground">{a.hd === t ? "今日" : "明日"}</span>
                          <span className="font-semibold">{a.venue}{a.rno}R</span>
                          <Boat n={a.lane} small />
                          <span className="num text-[10px] text-muted-foreground">{a.place ? `${a.place}着` : a.deadline}</span>
                        </Link>
                      ))}
                    </div>
                  ) : <div className="text-xs text-muted-foreground">見つかりません（分析済みのレースから探しています）</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
