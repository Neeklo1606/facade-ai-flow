/**
 * Выгрузка недели (ADR-066): одно меню на компьютере и телефоне. У каждого файла сказано,
 * что в него войдёт: «109 принятых записей» или «115 записей, из них 6 непроверенных».
 * Утверждённый файл недоступен, пока не пройдена итоговая проверка (ADR-053, 5), и меню
 * говорит это рядом с пунктом, а не после нажатия.
 */
import { Link } from "@tanstack/react-router";
import { CloudOff, Download, FileCheck2, FilePen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { plural } from "@/lib/format";

export function ExportMenu({
  confirmed,
  unchecked,
  finalLeft,
  busy,
  onDownload,
  sheetStatus,
  sheetConnected,
  onSync,
  wide,
  tour = true,
}: {
  /** Принятые записи недели: они идут в утверждённый файл */
  confirmed: number;
  /** Ждут проверки или уточнения: попадут только в черновик */
  unchecked: number;
  /** Сколько записей ещё ждут итоговой проверки на «Неделе» */
  finalLeft: number;
  busy: boolean;
  onDownload: (kind: "approved" | "draft") => void;
  sheetStatus: string;
  sheetConnected: boolean;
  onSync: () => void;
  /**
   * Телефон: утверждённый файл одним касанием, под кнопкой состав файла и «Черновик».
   * Меню на телефоне — лишнее касание перед самым частым действием
   */
  wide?: boolean;
  /** Цель тура `data-tour="export"`: одна на экран */
  tour?: boolean;
}) {
  const records = (n: number) => `${n} ${plural(n, "запись", "записи", "записей")}`;
  const approvedHint =
    finalLeft > 0
      ? `Сначала итоговая проверка: осталось ${finalLeft}`
      : `${records(confirmed)}, только принятые`;
  const draftHint = unchecked
    ? `${records(confirmed + unchecked)}, из них ${unchecked} ${plural(unchecked, "непроверенная", "непроверенные", "непроверенных")}`
    : `${records(confirmed)}, непроверенных нет`;

  if (wide) {
    return (
      <div className="flex flex-col gap-2" data-testid="export-phone">
        <Button
          data-tour={tour ? "export" : undefined}
          disabled={busy || finalLeft > 0}
          className="h-12 w-full"
          onClick={() => onDownload("approved")}
        >
          <Download aria-hidden />
          Выгрузить Excel
        </Button>
        <p className="type-small text-ink-3">{approvedHint}</p>
        <Button
          variant="outline"
          disabled={busy}
          className="w-full"
          onClick={() => onDownload("draft")}
        >
          <FilePen aria-hidden />
          Черновик Excel
        </Button>
        <p className="type-small text-ink-3">Черновик: {draftHint}</p>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-tour={tour ? "export" : undefined} disabled={busy}>
          <Download aria-hidden />
          Выгрузить
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="filter-pop w-80 border-0 p-1.5">
        <DropdownMenuItem
          className="export-item"
          disabled={busy || finalLeft > 0}
          onSelect={() => onDownload("approved")}
        >
          <FileCheck2 aria-hidden className="mt-0.5 size-5 shrink-0 text-up" />
          <span className="flex min-w-0 flex-col">
            <span className="text-body-strong">Excel утверждённый</span>
            <span className="type-small text-ink-3">{approvedHint}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="export-item"
          disabled={busy}
          onSelect={() => onDownload("draft")}
        >
          <FilePen aria-hidden className="mt-0.5 size-5 shrink-0 text-flame-text" />
          <span className="flex min-w-0 flex-col">
            <span className="text-body-strong">Excel черновик</span>
            <span className="type-small text-ink-3">{draftHint}</span>
          </span>
        </DropdownMenuItem>
        {finalLeft > 0 ? (
          <DropdownMenuItem asChild className="export-item">
            <Link to="/gas/week" className="type-label text-flame-text">
              Перейти к итоговой проверке
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel
          className="flex items-center gap-2 px-3 py-2 type-small font-normal text-ink-3"
          data-testid="sheet-status"
        >
          {sheetConnected ? null : <CloudOff aria-hidden className="size-4 shrink-0" />}
          {sheetStatus}
        </DropdownMenuLabel>
        {sheetConnected ? (
          <DropdownMenuItem className="export-item" onSelect={onSync}>
            <RefreshCw aria-hidden className="mt-0.5 size-5 shrink-0" />
            Обновить таблицу
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
