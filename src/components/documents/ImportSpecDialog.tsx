import { useImportSpec } from "@/api/mutations";
import { fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { XlsxWizard, type WizardField } from "@/components/catalog/XlsxWizard";

/**
 * Загрузка спецификации из Excel (ADR-025, п. 2). Пока разбора документов нет, строки
 * спецификации приходят так: тем же мастером, что номенклатура, и с тем же честным отчётом.
 */
const FIELDS: WizardField[] = [
  { id: "position", label: "Номер позиции", guess: /№|номер|поз/ },
  { id: "name", label: "Наименование", required: true, guess: /наимен|назван|материал/ },
  { id: "qty", label: "Количество", required: true, guess: /кол|объём|объем|qty/ },
  { id: "unit", label: "Единица", required: true, guess: /^ед|изм|unit/ },
];

/** Столько строк принимает порт за один вызов (`importSpecInput`) */
const LIMIT = 5000;

export function ImportSpecDialog({
  open,
  onOpenChange,
  revisionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revisionId: string;
}) {
  const load = useImportSpec({ onFailed: (error) => toast.error(error.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Загрузить спецификацию из Excel</DialogTitle>
          <DialogDescription>
            Первая строка файла — заголовки. Строки станут позициями этой ревизии: материал система
            предложит по наименованию, подтвердите его сами. Номер позиции можно не указывать —
            проставится следующий свободный.
          </DialogDescription>
        </DialogHeader>
        <XlsxWizard
          fields={FIELDS}
          limit={LIMIT}
          hint="Таблица спецификации: номер, наименование, количество, единица"
          submitting={load.isPending}
          onClose={() => onOpenChange(false)}
          onSubmit={async (rows) => {
            const result = await load.mutateAsync({
              revisionId,
              rows: rows.map((row) => ({
                ...(row["position"] === undefined ? {} : { position: row["position"] }),
                name: row["name"] ?? "",
                qty: row["qty"] ?? "",
                unit: row["unit"] ?? "",
              })),
            });
            toast.success(`Загружено позиций: ${fmtNum(result.added)}`, {
              description: result.refused.length
                ? `Не принято строк: ${fmtNum(result.refused.length)} — они ниже`
                : "Материалы предложены по наименованию: подтвердите сопоставление.",
            });
            return result;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
