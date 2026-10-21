import {
  CalendarClock,
  ChevronRight,
  HardHat,
  Package,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { DraftCard, DraftField } from "@/api/types";
import { AttentionDot } from "./AttentionDot";
import { Marker } from "./Marker";
import { cn } from "@/lib/utils";

/**
 * Разбор: карточки «Работы, Люди и часы, Материалы, Проблемы, Завтра» (D1, п. 6). Пустые
 * группы не показываются. Значение крупно, подпись мелко; касание значения открывает шторку
 * источника с фразой расшифровки — строки «Показать источник» под каждым полем больше нет.
 *
 * Вид v3 (ADR-044): строки листа деталей, как у календаря в референсах. Группа — плашка
 * на ступень ниже листа, слева круглая иконка, значения крупно; слои различаются фоном.
 *
 * Ничего не применяется само: действия «Уточнить голосом» и «Верно» закреплены экраном.
 * Сомнительное помечено янтарной точкой и причиной словами.
 */
/** Маркер группы: до двух слов, как требует моно-подпись (дизайн-система, раздел 8) */
const groupMarker: Record<DraftCard["key"], string> = {
  works: "Работы",
  people: "Люди",
  materials: "Материалы",
  problems: "Проблемы",
  tomorrow: "Завтра",
};

const groupIcon: Record<DraftCard["key"], LucideIcon> = {
  works: HardHat,
  people: Users,
  materials: Package,
  problems: TriangleAlert,
  tomorrow: CalendarClock,
};

export function DraftReview({
  cards,
  onSource,
  request,
  className,
}: {
  /** Карточки разбора: считает слой данных, экран показывает (ADR-001, п. 5) */
  cards: DraftCard[];
  /** Касание значения с источником: экран открывает шторку */
  onSource: (field: DraftField) => void;
  /** Заявка, которая уйдёт по «Верно»; правка открывается касанием */
  request?: { title: string; detail: string; missing: string | null; onEdit: () => void } | null;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {cards
        .filter((card) => card.fields.length > 0)
        .map((card) => {
          const Icon = groupIcon[card.key];
          return (
            <section
              key={card.key}
              className="bg-surface-2 rounded-[var(--r-xl)] px-4 py-4 sm:px-5 sm:py-5"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "bg-surface grid size-10 shrink-0 place-items-center rounded-full",
                    card.key === "problems" ? "text-warn" : "text-text-2",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <Marker>{groupMarker[card.key]}</Marker>
              </div>
              <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
                {card.fields.map((field, index) => (
                  <div
                    key={`${card.key}-${index}`}
                    className={cn(
                      "min-w-0 rounded-[var(--r-md)] pt-2",
                      // Сомнительное поле на янтарной подложке: видно с вытянутой руки
                      field.attention && "bg-warn-bg -mx-2 mt-1 px-2 pb-2 sm:col-span-2",
                    )}
                  >
                    <dt className="text-caption text-text-3">{field.label}</dt>
                    <dd>
                      {field.quote ? (
                        <button
                          type="button"
                          onClick={() => onSource(field)}
                          aria-label={`${field.label}: ${field.value}. Откуда взято`}
                          className="focus-ring press text-card-title text-text -mx-1 inline-flex min-h-12 max-w-full items-center gap-2 rounded-[var(--r-xs)] px-1 text-left"
                        >
                          <span className="decoration-line-2 min-w-0 underline decoration-dotted decoration-1 underline-offset-[7px]">
                            {field.value}
                          </span>
                          {field.attention ? <AttentionDot reason={field.attention} /> : null}
                        </button>
                      ) : (
                        <span className="text-card-title text-text inline-flex min-h-12 items-center gap-2">
                          {field.value}
                          {field.attention ? <AttentionDot reason={field.attention} /> : null}
                        </span>
                      )}
                      {field.attention ? (
                        <p className="text-caption text-warn">{field.attention}</p>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
              {card.key === "materials" && request ? (
                <button
                  type="button"
                  onClick={request.onEdit}
                  className="focus-ring press bg-surface mt-3 flex min-h-14 w-full items-center gap-3 rounded-[var(--r-lg)] px-4 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-list block">{request.title}</span>
                    <span className="text-caption text-text-3 block">{request.detail}</span>
                    {request.missing ? (
                      <span className="text-caption text-warn block">{request.missing}</span>
                    ) : null}
                  </span>
                  <ChevronRight className="text-text-3 size-4 shrink-0" />
                </button>
              ) : null}
            </section>
          );
        })}
    </div>
  );
}
