import { useImportMaterials } from "@/api/mutations";
import { fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { XlsxWizard, type WizardField } from "./XlsxWizard";

/**
 * Загрузка номенклатуры из Excel (ADR-023, п. 3). Мастер общий с загрузкой спецификации,
 * здесь только поля справочника и то, что делать с результатом.
 */
const FIELDS: WizardField[] = [
  { id: "name", label: "Наименование", required: true, guess: /наимен|назван|материал|номенклат/ },
  { id: "unit", label: "Единица", required: true, guess: /^ед|изм|unit/ },
  { id: "category", label: "Категория", required: true, guess: /катег|раздел|групп/ },
  { id: "characteristics", label: "Характеристики", guess: /характер|свойств|параметр/ },
];

/** Столько строк принимает порт за один вызов (`importMaterialsInput`) */
const LIMIT = 5000;

export function ImportMaterialsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const load = useImportMaterials({ onFailed: (error) => toast.error(error.message) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Загрузить номенклатуру из Excel</DialogTitle>
          <DialogDescription>
            Первая строка файла — заголовки. Загрузка добавляет новое и обновляет известное по паре
            «наименование и единица»; ничего не удаляет.
          </DialogDescription>
        </DialogHeader>
        <XlsxWizard
          fields={FIELDS}
          limit={LIMIT}
          hint="Выгрузка из 1С или Excel: наименование, единица, категория"
          submitting={load.isPending}
          onClose={() => onOpenChange(false)}
          onSubmit={async (rows) => {
            const result = await load.mutateAsync({
              rows: rows.map((row) => ({
                name: row["name"] ?? "",
                unit: row["unit"] ?? "",
                category: row["category"] ?? "",
                ...(row["characteristics"] === undefined
                  ? {}
                  : { characteristics: row["characteristics"] }),
              })),
            });
            toast.success(
              `Загружено: добавлено ${fmtNum(result.added)}, обновлено ${fmtNum(result.updated)}`,
              result.refused.length
                ? { description: `Не принято строк: ${fmtNum(result.refused.length)} — они ниже` }
                : undefined,
            );
            return result;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
