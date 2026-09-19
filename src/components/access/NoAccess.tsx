import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { employeeRoleLabel } from "@/contracts";
import { rolesWith, sectionShortLabel, type Section } from "@/api/access";
import { Button } from "@/components/ui/button";

/** Название роли внутри предложения: «прораб», но «ПТО» — аббревиатура остаётся прописной */
const inSentence = (label: string) =>
  label === label.toUpperCase() ? label : label[0]!.toLowerCase() + label.slice(1);

/**
 * Экран «Нет доступа» (ADR-012, п. 6): прямой переход в раздел, закрытый для роли, или в объект,
 * которого нет среди объектов сотрудника. Объясняет, у кого доступ, и ведёт в доступный раздел.
 */
export function NoAccess({
  section,
  reason,
  userName,
  roleLabel,
  home,
}: {
  section: Section;
  /** role — разделу закрыт роли; project — объект не среди объектов сотрудника */
  reason: "role" | "project";
  userName: string;
  roleLabel: string;
  home: { to: string; label: string };
}) {
  const roles = rolesWith(section).map((role) => inSentence(employeeRoleLabel[role]));
  return (
    <section
      aria-labelledby="no-access-title"
      className="mx-auto flex min-h-[60vh] max-w-[520px] flex-col items-center justify-center text-center"
      data-screen="no-access"
    >
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-text-2">
        <Lock className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 id="no-access-title" className="mt-4 text-section-title text-text">
        {reason === "project"
          ? "Нет доступа к этому объекту"
          : `Нет доступа к разделу «${sectionShortLabel[section]}»`}
      </h1>
      <p className="mt-2 text-[14px] text-text-2">
        Вы вошли как {userName}, {inSentence(roleLabel)}.{" "}
        {reason === "project"
          ? "Прорабу открыты только объекты, где он в команде или ведёт бригаду."
          : roles.length
            ? `Раздел открыт ролям: ${roles.join(", ")}.`
            : "Раздел не открыт ни одной роли."}
      </p>
      <p className="mt-1 text-[13px] text-text-3">
        Если раздел нужен для работы, обратитесь к руководителю проекта.
      </p>
      <Button asChild className="mt-6">
        <Link to={home.to}>{home.label}</Link>
      </Button>
    </section>
  );
}
