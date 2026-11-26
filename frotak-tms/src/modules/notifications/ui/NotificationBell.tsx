import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { relativeTimeLabel } from "@/modules/notifications/domain/notification";
import { useNotificationCenter } from "@/modules/notifications/ui/NotificationCenter";

const SHOWN = 8;

/** Sino do cabecalho: contador de nao lidas e os avisos mais recentes. */
export function NotificationBell() {
  const center = useNotificationCenter();
  const [opened, setOpened] = useState(false);
  const recent = center.items.slice(0, SHOWN);
  const badge = center.unread > 9 ? "9+" : String(center.unread);

  return (
    <Popover open={opened} onOpenChange={setOpened}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex size-10 items-center justify-center rounded-2xl border border-border bg-surface-2/70 text-muted-foreground transition hover:border-primary/35 hover:bg-primary/10 hover:text-primary"
          aria-label={
            center.unread > 0 ? `Notificações: ${center.unread} não lidas` : "Notificações"
          }
        >
          <Bell className="size-4" />
          {center.unread > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-foreground tabular-nums">
              {badge}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Notificações</p>
            <p className="text-[11px] text-muted-foreground">
              {center.unread > 0 ? `${center.unread} não lidas` : "Tudo lido"}
            </p>
          </div>
          {center.unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void center.markAllRead()}
              className="shrink-0"
            >
              <CheckCheck />
              Marcar todas
            </Button>
          ) : null}
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain">
          {center.error && recent.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">{center.error}</p>
          ) : center.loading && recent.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Carregando…</p>
          ) : recent.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Nenhuma notificação ainda. Quando um frete mudar de etapa, ela aparece aqui.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpened(false);
                      center.open(item);
                    }}
                    className={cn(
                      "flex w-full min-w-0 gap-3 px-4 py-3 text-left transition hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
                      !item.readAt && "bg-primary/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.readAt ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[13px] font-semibold leading-snug text-foreground">
                        {item.title}
                      </span>
                      {item.body ? (
                        <span className="mt-0.5 line-clamp-2 block break-words text-xs leading-[1.5] text-muted-foreground">
                          {item.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {relativeTimeLabel(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to="/notificacoes" onClick={() => setOpened(false)}>
              <Settings2 />
              Histórico e preferências
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
