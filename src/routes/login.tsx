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
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-6 text-text-primary lg:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-24 -z-10 mx-auto h-[520px] max-w-4xl rounded-[50%] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--text-primary) 14%, transparent), transparent)",
        }}
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-caption font-semibold text-accent-foreground">
            ФР
          </div>
          <span className="text-card-title">ФАСАД-РП</span>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] px-2 py-1.5 backdrop-blur-xl md:flex">
          <span className="rounded-full bg-accent px-3.5 py-1.5 text-caption font-medium text-accent-foreground">
            Демо
          </span>
          <span className="px-3 text-caption text-text-secondary">
            • Прототип с AI-агентами
          </span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] px-3.5 py-2 text-caption text-text-secondary backdrop-blur-xl">
          <ShieldCheck className="size-4 shrink-0" />
          <span className="hidden sm:inline">Синтетические данные</span>
        </span>
      </header>

      <main className="mx-auto w-full max-w-6xl pt-16 pb-10 lg:pt-24">
        <h1 className="text-center text-[clamp(44px,9vw,116px)] leading-[0.92] font-semibold tracking-[-0.05em]">
          ФАСАД-РП
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-center text-base text-text-secondary">
          Объекты, задачи, отчёты прорабов из Telegram, снабжение и договорной контроль в одном
          рабочем месте. Агенты готовят данные — решения принимает человек.
        </p>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {demoAccounts.map((a) => {
            const Icon = roleIcon[a.role];
            return (
              <button
                key={a.role}
                onClick={() => enter(a.role)}
                className="glass-panel group flex flex-col items-start gap-6 p-7 text-left transition-fast hover:-translate-y-1"
              >
                <span className="rounded-full bg-accent-subtle px-3 py-1 text-caption text-text-secondary">
                  {a.roleLabel}
                </span>
                <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Icon className="size-6" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-section-title">Войти как {a.roleLabel}</span>
                  <span className="mt-1 block text-table text-text-secondary">
                    {a.user.name} ·{" "}
                    {a.role === "pm" ? "полный доступ ко всем разделам" : "свои объекты, задачи и отчёты"}
                  </span>
                </span>
                <span className="mt-auto inline-flex items-center gap-2 text-table font-medium">
                  Продолжить
                  <ArrowRight className="size-4 transition-fast group-hover:translate-x-1" />
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3">
          <Button size="lg" onClick={() => enter("pm")}>
            Быстрый старт
          </Button>
          <p className="max-w-md text-center text-caption text-text-muted">
            Любые «отправки» в прототипе — демо-имитация с пометкой, реальные письма и сообщения не
            уходят.
          </p>
        </div>
      </main>
    </div>
  );
}

