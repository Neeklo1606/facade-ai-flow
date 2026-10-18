import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useResetDemo } from "@/api/mutations";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import { resetGuideProgress } from "@/lib/guide/store";
import { homeRouteFor } from "@/lib/navigation";
import { useCurrentRole } from "@/lib/project-scope";
import { toast } from "@/lib/toast";

/**
 * Сброс демонстрации с подтверждением (ADR-038): данные вкладки возвращаются к фикстурам,
 * шаги показа начинаются заново. Необратимо для этой вкладки, поэтому — диалог, а не тост.
 * Один на продукт: меню, «Ещё» и финал показа зовут этот же компонент.
 */
export function DemoReset({ trigger, onDone }: { trigger: ReactNode; onDone?: () => void }) {
  const resetDemo = useResetDemo();
  const { setProjectId } = useApp();
  const role = useCurrentRole();
  const navigate = useNavigate();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Начать показ заново?</AlertDialogTitle>
          <AlertDialogDescription>
            Записи, отчёты, решения ПТО и заявки, созданные в этой вкладке, удалятся. Данные и шаги
            показа вернутся к началу.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await resetDemo();
              resetGuideProgress();
              setProjectId(ALL_PROJECTS);
              onDone?.();
              void navigate({ to: homeRouteFor(role) });
              toast.success("Демо-данные сброшены");
            }}
          >
            Сбросить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
