import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, HardHat, ShieldCheck, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { demoAccounts, useAuth, type DemoRole } from "@/lib/auth-context";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Демо-вход — ФАСАД-РП" },
      {
        name: "description",
        content: "Демо-вход в прототип ФАСАД-РП: выберите роль — руководитель проекта или прораб.",
      },
      { property: "og:title", content: "Демо-вход — ФАСАД-РП" },
      { property: "og:description", content: "Прототип управления фасадными проектами с AI-агентами." },
    ],
  }),
  component: LoginPage,
});

const roleIcon = { pm: UserCog, foreman: HardHat } as const;

function LoginPage() {
  const { account, signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (account) navigate({ to: "/dashboard", replace: true });
  }, [account, navigate]);

  const enter = (role: DemoRole) => {
    signIn(role);
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="grid min-h-screen bg-background text-text-primary lg:grid-cols-2">
      <div className="flex flex-col justify-between bg-[color:var(--sidebar-bg)] px-6 py-10 lg:px-12">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--sidebar-active-bar)] text-table font-semibold text-white">
            ФР
          </div>
          <div className="min-w-0">
            <div className="text-card-title text-[color:var(--sidebar-active-text)]">ФАСАД-РП</div>
            <div className="text-caption text-[color:var(--sidebar-item)]">СК «Фасадные системы»</div>
          </div>
        </div>

        <div className="my-10 max-w-md">
          <h1 className="text-page-title text-[color:var(--sidebar-active-text)]">
            Управление фасадными проектами с AI-агентами
          </h1>
          <p className="mt-3 text-base text-[color:var(--sidebar-item)]">
            Объекты, задачи, отчёты прорабов из Telegram, снабжение и договорной контроль в одном
            рабочем месте. Агенты готовят данные — решения принимает человек.
          </p>
        </div>

        <p className="inline-flex items-center gap-2 text-caption text-[color:var(--sidebar-item)]">
          <ShieldCheck className="size-4 shrink-0" />
          Демо-прототип. Все данные синтетические
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-10 lg:px-12">
        <div className="card-surface w-full max-w-md p-6">
          <h2 className="text-section-title">Демо-вход</h2>
          <p className="mt-1 text-table text-text-secondary">
            Паролей нет: выберите роль, чтобы увидеть свой набор разделов и прав.
          </p>

          <div className="mt-6 space-y-3">
            {demoAccounts.map((a) => {
              const Icon = roleIcon[a.role];
              return (
                <button
                  key={a.role}
                  onClick={() => enter(a.role)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left transition-fast hover:border-accent hover:bg-subtle"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-table font-medium">
                      Войти как {a.roleLabel} — {a.user.name}
                    </span>
                    <span className="block truncate text-caption text-text-muted">
                      {a.role === "pm" ? "полный доступ ко всем разделам" : "свои объекты, задачи и отчёты"}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-text-muted" />
                </button>
              );
            })}
          </div>

          <p className="mt-6 text-caption text-text-muted">
            Любые «отправки» в прототипе — демо-имитация с пометкой, реальные письма и сообщения не
            уходят.
          </p>
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => enter("pm")}>
            Быстрый старт
          </Button>
        </div>
      </div>
    </div>
  );
}
