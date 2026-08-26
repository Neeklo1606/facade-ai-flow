import { Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function AccessDenied({ role }: { role: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card-surface max-w-md p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-subtle text-text-muted">
          <Lock className="size-5" strokeWidth={1.75} />
        </span>
        <h1 className="mt-4 text-section-title">Доступ ограничен</h1>
        <p className="mt-2 text-table text-text-secondary">
          Раздел недоступен для роли «{role}». Обратитесь к руководителю проекта или вернитесь на
          дашборд.
        </p>
        <Button asChild className="mt-5 min-h-11">
          <Link to="/dashboard">На дашборд</Link>
        </Button>
      </div>
    </div>
  );
}
