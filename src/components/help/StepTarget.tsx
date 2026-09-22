import { Link } from "@tanstack/react-router";
import { ArrowRight, Lock } from "lucide-react";
import { employeeRoleLabel } from "@/contracts";
import { rolesWith, sectionOfPath, sectionShortLabel, useAccess } from "@/api/access";

/** Название роли внутри предложения: «прораб», но «ПТО» — аббревиатура остаётся прописной */
const inSentence = (label: string) =>
  label === label.toUpperCase() ? label : label[0]!.toLowerCase() + label.slice(1);

/**
 * Переход из шага справки. Ссылка рисуется, только если роль может открыть этот экран;
 * иначе на её месте — причина (ADR-012, п. 6: ссылок в закрытые разделы экраны не рисуют).
 *
 * Зачем: статьи видны всем, и это правильно — снабженцу полезно знать, что видит прораб
 * (ADR-019, п. 6). Но ссылка «Открыть экран» обещала живой экран, а трём ролям из пяти
 * приводила в отказ по правам. ADR-015 считает такой переход тупиком; находка независимой
 * проверки ветки.
 */
export function StepTarget({ to }: { to: string }) {
  const { ready, canOpen } = useAccess();
  if (!ready) return null;

  if (canOpen(to)) {
    return (
      <Link
        to={to}
        search={{}}
        className="focus-ring mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-xs)] text-[13px] font-medium text-text-2 transition-fast is-hover:text-text lg:min-h-0"
      >
        Открыть экран <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden />
      </Link>
    );
  }

  const url = new URL(to, "http://local");
  const section = sectionOfPath(url.pathname, url.searchParams.get("view") ?? undefined);
  const roles = section
    ? rolesWith(section).map((role) => inSentence(employeeRoleLabel[role]))
    : [];
  return (
    <span className="mt-1 flex items-start gap-1.5 text-[13px] leading-[1.45] text-text-3">
      <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span>
        {section ? `Экран «${sectionShortLabel[section]}» вашей роли закрыт` : "Экран вам закрыт"}
        {roles.length ? `: он открыт ролям ${roles.join(", ")}.` : "."} Шаг оставлен, чтобы было
        видно, как устроена работа целиком.
      </span>
    </span>
  );
}
