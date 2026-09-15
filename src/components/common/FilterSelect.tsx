import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "all";

/**
 * Выпадающее условие отбора в панели фильтров реестра.
 * Значение рисуется явно, чтобы оно было видно ещё до гидратации.
 */
export function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : next)}
    >
      <SelectTrigger
        aria-label={label}
        className={cn(
          "h-9 w-full min-w-0 gap-2 rounded-full text-[13px] sm:w-auto sm:min-w-[150px] sm:shrink-0",
          value && "border-border-strong bg-subtle",
        )}
      >
        {value && <span className="hidden text-text-muted sm:inline">{label}:</span>}
        <SelectValue>
          {options.find((option) => option.value === value)?.label ?? allLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
