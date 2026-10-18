import { InfoTip } from "./InfoTip";
import type { ReactNode } from "react";
import { PageActions } from "@/components/layout/PageActions";

function splitDescription(text: string) {
  const idx = text.indexOf(". ");
  if (idx === -1 || text.length <= 96) return { lead: text, rest: "" };
  return { lead: text.slice(0, idx + 1), rest: text.slice(idx + 2) };
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  const parts = description ? splitDescription(description) : null;

  return (
    // Без описания и меток видимой части нет: заголовок и действия уже в шапке контента
    <div
      className={
        parts || meta
          ? "mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2"
          : "mb-6 block lg:contents"
      }
    >
      <div className="min-w-0">
        {/* Заголовок экрана в контенте на телефоне (правило 4 этапа D); с 1024 px его показывает шапка */}
        <h1 className="relative mb-2 text-page-title lg:sr-only">{title}</h1>
        {parts && (
          <p className="mt-1 flex min-w-0 items-start gap-1.5 text-[13px] text-text-secondary">
            <span>{parts.lead}</span>
            {parts.rest && <InfoTip label="Подробнее">{parts.rest}</InfoTip>}
          </p>
        )}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <PageActions>{actions}</PageActions>}
    </div>
  );
}
