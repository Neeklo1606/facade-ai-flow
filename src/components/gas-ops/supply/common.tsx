/**
 * Общие части экранов снабжения (ADR-057): тон статуса, вход по роли, выбор файла.
 */
import { Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { useGasActor } from "@/api/gas-ops";
import type { SupplyStatus } from "@/api/gas-supply";
import { EmptyState, type StatusTone } from "@/components/ui/mono";
import { gasScreen, ROLE_HOME, type GasScreenKey } from "@/lib/gas-ops/screens";

export const SUPPLY_TONE: Record<SupplyStatus, StatusTone> = {
  new: "note",
  "in-work": "caution",
  "waiting-offers": "caution",
  ordered: "neutral",
  "in-transit": "neutral",
  partial: "caution",
  delivered: "up",
  closed: "up",
  rejected: "down",
};

export function ru(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "";
}

export function short(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "";
}

/**
 * Экран открывается только своим ролям, и по прямой ссылке тоже. Это не защита данных
 * (их режет слой данных и порт), а честный ответ вместо пустой таблицы
 */
export function SupplyGate({ screen, children }: { screen: GasScreenKey; children: ReactNode }) {
  const actor = useGasActor();
  if (gasScreen(screen).roles.includes(actor.role)) return <>{children}</>;
  const home = gasScreen(ROLE_HOME[actor.role]);
  return (
    <EmptyState
      title="Этот экран для другой роли"
      text={`Ваш рабочий экран: «${home.title}». Сменить роль можно в меню аватара.`}
    />
  );
}

/** Выбор файла кнопкой 48: в демо хранится только имя файла, сам файл не сохраняется */
export function FilePick({
  label,
  accept,
  files,
  onPick,
  multiple = false,
  capture = false,
}: {
  label: string;
  accept: string;
  files: readonly string[];
  onPick: (names: string[]) => void;
  multiple?: boolean;
  capture?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="mono-btn mono-btn-secondary mono-btn-field focus-within:ring-2 focus-within:ring-ink cursor-pointer self-start">
        <Paperclip aria-hidden />
        {label}
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          {...(capture ? { capture: "environment" as const } : {})}
          className="sr-only"
          onChange={(event) => {
            const names = Array.from(event.target.files ?? []).map((f) => f.name);
            if (names.length) onPick(names);
            event.target.value = "";
          }}
        />
      </label>
      {files.length ? (
        <ul className="flex flex-col gap-1 type-small text-ink-2">
          {files.map((name) => (
            <li key={name} className="truncate">
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
