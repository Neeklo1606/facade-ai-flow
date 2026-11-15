/**
 * Папка смет (ADR-072): что лежит в папке Яндекс Диска и что из этого уже в системе.
 * Одно действие — «Забрать»: новые и изменённые файлы становятся версиями смет, которые ждут
 * подтверждения. Неподключённый диск назван прямо, с тем, кто и что должен сделать.
 */
import { CloudDownload, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/kit/status";
import type { FetchedFile, FolderRow, FolderStatus } from "@/api/gas-folder";
import { plural } from "@/lib/format";

const STATE: Record<FolderRow["state"]["kind"], { text: string; tone: ChipTone }> = {
  new: { text: "новая", tone: "sky" },
  changed: { text: "изменилась", tone: "decide" },
  loaded: { text: "загружена", tone: "ok" },
  skipped: { text: "не смета", tone: "neutral" },
};

function stateText(row: FolderRow): string {
  const s = row.state;
  if (s.kind === "loaded") return `загружена, версия ${s.version}`;
  if (s.kind === "changed") return `изменилась после версии ${s.version}`;
  if (s.kind === "skipped") return s.reason;
  return STATE.new.text;
}

const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

export function FolderCard({
  status,
  rows,
  summary,
  error,
  loading,
  busy,
  pending,
  canFetch,
  onRefresh,
  onFetch,
}: {
  status: FolderStatus | null;
  rows: FolderRow[];
  summary: string;
  error: string | null;
  loading: boolean;
  busy: boolean;
  pending: number;
  canFetch: boolean;
  onRefresh: () => void;
  onFetch: () => Promise<FetchedFile[]>;
}) {
  const connected = status?.connected === true;
  const demo = status !== null && !status.connected && status.demo;
  const where = connected
    ? `Яндекс Диск · ${status.folder.replace(/^disk:/, "")}`
    : demo
      ? "Демо: Яндекс Диск не подключён, папка-образец"
      : "Яндекс Диск не подключён";
  const usable = connected || demo;
  const smeta = (n: number) => `${n} ${plural(n, "смету", "сметы", "смет")}`;

  return (
    <section
      aria-labelledby="estimate-folder"
      className="surface-1 overflow-hidden"
      data-testid="estimate-folder"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-row py-row">
        <div className="flex min-w-0 items-start gap-3">
          <FolderOpen className="mt-0.5 size-5 shrink-0 text-text-3" aria-hidden />
          <div className="min-w-0">
            <h2 id="estimate-folder" className="text-body-strong">
              Папка смет
            </h2>
            <p className="text-meta text-text-3 break-words">{where}</p>
            <p className="mt-1 text-meta text-text-2" data-testid="estimate-folder-summary">
              {loading
                ? "Смотрю папку…"
                : usable
                  ? (error ?? summary)
                  : `${error ?? "Нет токена на сервере"}. Администратор сервера задаёт YANDEX_DISK_TOKEN и папку YANDEX_DISK_FOLDER; дальше сметы, положенные в папку, забираются отсюда одним нажатием`}
            </p>
          </div>
        </div>
        {usable ? (
          <div className="flex flex-wrap items-center gap-2">
            {canFetch ? (
              <Button
                variant="primary"
                disabled={busy || loading || pending === 0}
                onClick={() => void onFetch()}
                iconEnd={<CloudDownload />}
              >
                {busy ? "Забираю…" : pending ? `Забрать ${smeta(pending)}` : "Новых смет нет"}
              </Button>
            ) : null}
            <Button
              variant="quiet"
              disabled={loading || busy}
              onClick={onRefresh}
              aria-label="Обновить список папки"
            >
              <RefreshCw aria-hidden />
              Обновить
            </Button>
          </div>
        ) : null}
      </div>
      {usable && rows.length ? (
        <ul className="border-t border-line [&>li+li]:border-t [&>li+li]:border-line">
          {rows.map((row) => (
            <li
              key={row.file.path}
              className="flex min-h-11 items-center justify-between gap-3 px-row py-2"
              data-testid="estimate-folder-file"
            >
              <span className="min-w-0">
                <span className="block truncate text-body">{row.file.name}</span>
                <span className="block text-meta text-text-3">
                  {sizeText(row.file.size)} · {stateText(row)}
                </span>
              </span>
              <Chip tone={STATE[row.state.kind].tone}>{STATE[row.state.kind].text}</Chip>
            </li>
          ))}
        </ul>
      ) : null}
      {usable ? (
        <p className="border-t border-line px-row py-2 text-meta text-text-3">
          Из файла берутся итоги по строкам с номерами, как при загрузке руками. Стоимость работ по
          правилу станет кандидатом: её подтверждает менеджер.
        </p>
      ) : null}
    </section>
  );
}
