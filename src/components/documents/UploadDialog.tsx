import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, FileText, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queries } from "@/api/queries";
import { useUploadDocument } from "@/api/mutations";
import { dataSource } from "@/api/config";
import { DEMO_UPLOAD_NOTE } from "@/lib/demo-copy";
import { processingStages } from "@/contracts";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Разделы проекта, которые система различает. Свой раздел вводится в поле «Другой» */
const SECTIONS = ["НВФ", "АР", "КМ", "КЖ", "ЭОМ"] as const;

/** Имя файла без расширения и подчёркиваний — предложение, которое человек может поправить */
function titleFromFile(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function guessSection(name: string) {
  if (/ар|фасад|архитект/i.test(name)) return "АР";
  if (/км|металл|расч[её]т/i.test(name)) return "КМ";
  return "НВФ";
}

/**
 * Загрузка документа как процесс (ADR-018, п. 5): человек видит, что уйдёт, под каким именем
 * и в какой раздел; потом — стадии обработки словами; в конце — что нашлось и куда идти.
 */
export function UploadDialog({
  projectId,
  file,
  queue,
  onClose,
  onNext,
}: {
  projectId: string;
  file: File;
  /** Сколько файлов ещё ждёт своей очереди */
  queue: number;
  onClose: () => void;
  onNext: () => void;
}) {
  const upload = useUploadDocument();
  const [title, setTitle] = useState(() => titleFromFile(file.name));
  const [section, setSection] = useState(() => guessSection(file.name));
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // Предпросмотр — сам файл человека, а не картинка из демо-набора: PDF умеет показать браузер
  const preview = useMemo(
    () => (file.type === "application/pdf" ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  /*
   * Пока документ обрабатывается, список документов объекта перечитывается: в нём и стадия,
   * и счётчики извлечённого — те же числа, что увидит человек в реестре
   */
  const list = useQuery({ ...queries.documents(projectId), enabled: !!revisionId });
  const card = useMemo(
    () => (list.data ?? []).find((item) => item.document.id === revisionId) ?? null,
    [list.data, revisionId],
  );
  /*
   * Стадию считает слой данных (`stage` карточки), экран только показывает. Последняя стадия —
   * «Готов к проверке»: её номер и означает конец обработки
   */
  const job = card?.job ?? null;
  const stage = card?.stage ?? 0;
  const failedJob = job?.status === "failed" ? (job.error ?? "Обработчик вернул ошибку.") : null;
  const ready = !!card && !failedJob && (!job || stage >= processingStages.length - 1);

  async function submit() {
    setFailure(null);
    try {
      const created = await upload.mutateAsync({
        projectId,
        fileName: file.name,
        title,
        section,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
      });
      setRevisionId(created.id);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Файл не загрузился. Проверьте размер (до 500 МБ) и повторите.",
      );
    }
  }

  const positions = card?.extracted ?? 0;
  // «Требуют внимания» — ещё не проверенные позиции: столько работы у ПТО после разбора
  const attention = Math.max(0, positions - (card?.verified ?? 0));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[min(680px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>
            {revisionId ? "Документ обрабатывается" : "Загрузка документа"}
            {queue > 0 && !revisionId && (
              <span className="ml-2 text-[13px] font-normal text-text-3">
                ещё в очереди: {queue}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!revisionId && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-[var(--r-sm)] border border-line bg-surface-2 p-3">
              <FileText
                className="mt-0.5 size-5 shrink-0 text-text-3"
                strokeWidth={1.5}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium">{file.name}</p>
                <p className="mt-0.5 text-[13px] text-text-3">
                  {file.name.split(".").pop()?.toUpperCase()} ·{" "}
                  {fmtNum(Math.max(1, Math.round(file.size / 1024)))} КБ
                </p>
              </div>
            </div>

            {preview ? (
              <div className="overflow-hidden rounded-[var(--r-sm)] border border-line">
                <p className="border-b border-line bg-surface-2 px-3 py-1.5 text-[12px] text-text-3">
                  Первая страница вашего файла
                </p>
                <iframe
                  title="Первая страница документа"
                  src={`${preview}#page=1&toolbar=0&navpanes=0`}
                  className="h-[220px] w-full bg-surface-2"
                />
              </div>
            ) : (
              <p className="text-[13px] leading-[1.45] text-text-3">
                Предпросмотр доступен для PDF. Таблицы из DOCX и XLSX система читает при разборе.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <label className="block">
                <span className="mb-1 block text-[13px] text-text-2">Название документа</span>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] text-text-2">Раздел проекта</span>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger aria-label="Раздел проекта">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <p className="text-[13px] leading-[1.45] text-text-3">
              Система распознает текст, найдёт таблицы и извлечёт позиции. Проверять их будете вы:
              каждая позиция показана рядом со строкой оригинала.
              {dataSource === "demo" && ` ${DEMO_UPLOAD_NOTE}`}
            </p>

            {failure && (
              <p className="text-[13px] leading-[1.45] text-danger" role="alert">
                {failure}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Отмена
              </Button>
              <Button onClick={submit} loading={upload.isPending} disabled={!title.trim()}>
                Загрузить и разобрать
              </Button>
            </div>
          </div>
        )}

        {revisionId && (
          <div className="space-y-4">
            <ol className="space-y-2">
              {processingStages.map((name, index) => {
                const done = failedJob ? index < stage : ready || index < stage;
                const current = !failedJob && !ready && index === stage;
                return (
                  <li key={name} className="flex items-center gap-2.5 text-[14px]">
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        done
                          ? "border-ok/40 bg-ok/10 text-ok"
                          : current
                            ? "border-orange-line text-orange"
                            : "border-line text-text-3",
                      )}
                    >
                      {done ? (
                        <Check className="size-3" strokeWidth={2.5} aria-hidden />
                      ) : current ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : null}
                    </span>
                    <span className={cn(done || current ? "text-text" : "text-text-3")}>
                      {name}
                    </span>
                  </li>
                );
              })}
            </ol>

            {failedJob && (
              <div className="rounded-[var(--r-sm)] border border-danger/30 bg-danger-bg p-3">
                <p className="text-[14px] font-medium text-danger">Разобрать документ не вышло</p>
                <p className="mt-1 text-[13px] leading-[1.45] text-text-2">
                  {failedJob} Документ остался в реестре со статусом «Загружен»: попробуйте
                  загрузить его ещё раз или пришлите другой формат.
                </p>
              </div>
            )}

            {ready && !failedJob && (
              <div className="rounded-[var(--r-sm)] border border-line bg-surface-2 p-3">
                <p className="text-[14px]">
                  Найдено позиций: <span className="font-semibold">{fmtNum(positions)}</span>
                  {attention > 0 && (
                    <>
                      , требуют внимания:{" "}
                      <span className="font-semibold text-warn">{fmtNum(attention)}</span>
                    </>
                  )}
                </p>
                {dataSource === "demo" && (
                  <p className="mt-1 text-[13px] leading-[1.45] text-text-3">{DEMO_UPLOAD_NOTE}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {queue > 0 && (
                <Button variant="secondary" onClick={onNext}>
                  Следующий файл ({queue})
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Закрыть
              </Button>
              {ready && !failedJob && (
                <Button asChild>
                  <Link
                    to="/projects/$id/documents/$docId"
                    params={{ id: projectId, docId: revisionId }}
                    search={{}}
                    onClick={onClose}
                  >
                    Перейти к проверке <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
