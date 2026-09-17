import { forwardRef, useImperativeHandle, useRef, useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const ACCEPT = [".pdf", ".docx", ".xlsx"];

export interface UploadZoneHandle {
  open: () => void;
}

/** Зона загрузки перетаскиванием. Принимает PDF, DOCX и XLSX, остальное отклоняет с объяснением. */
export const UploadZone = forwardRef<
  UploadZoneHandle,
  { onFiles: (files: File[]) => void; className?: string }
>(function UploadZone({ onFiles, className }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useImperativeHandle(ref, () => ({ open: () => input.current?.click() }));

  function accept(list: FileList | null) {
    const files = Array.from(list ?? []);
    const ok = files.filter((file) => ACCEPT.some((ext) => file.name.toLowerCase().endsWith(ext)));
    const rejected = files.length - ok.length;
    if (rejected) {
      toast.error(`${rejected} ${rejected === 1 ? "файл не принят" : "файла не принято"}`, {
        description: "Поддерживаются PDF, DOCX и XLSX.",
      });
    }
    if (ok.length) onFiles(ok);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files);
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--r-md)] border border-dashed border-border-strong bg-surface px-5 py-5 text-center transition-fast hover:border-line-2 hover:bg-surface-2 sm:flex-row sm:text-left",
        dragging && "border-line-2 bg-surface-2",
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle text-text-secondary transition-fast group-hover:bg-surface-3 group-hover:text-text">
        <FileUp className="size-5" strokeWidth={1.5} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">
          {dragging
            ? "Отпустите, чтобы загрузить"
            : "Перетащите документы сюда или выберите на диске"}
        </span>
        <span className="mt-0.5 block text-caption text-text-muted">
          PDF, DOCX, XLSX · спецификации, ведомости, разделы АР и КМ. Таблицы и позиции извлекаются
          автоматически.
        </span>
      </span>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT.join(",")}
        className="sr-only"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
});
