import { useState } from "react";
import { createLazyFileRoute, useRouter } from "@tanstack/react-router";
import { KeyRound, Loader2, Phone } from "lucide-react";
import { acceptInviteFn, requestCodeFn, verifyCodeFn } from "@/api/auth-functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Вход сотрудника (ADR-021). Телефон и код: пароля в системе нет — на стройке его забудут,
 * а сброс через почту у прораба недоступен.
 *
 * Экран отвечает одинаково на известный и неизвестный номер: форма входа не должна работать
 * способом узнать, кто числится в компании.
 */

const REFUSALS: Record<string, string> = {
  "too-often":
    "Код запрашивали слишком часто. Попробуйте через час или попросите ссылку у руководителя.",
  "no-attempts": "Код введён неверно три раза. Запросите новый.",
  wrong: "Код не подошёл. Проверьте цифры и попробуйте ещё раз.",
  expired: "Код устарел: он живёт пять минут. Запросите новый.",
  "no-database": "Система не настроена: вход работает только с базой данных.",
  "no-channel":
    "Отправка кодов не настроена, поэтому код не выдаётся. Попросите у руководителя ссылку-приглашение: по ней вход работает.",
};

function LoginPage() {
  const router = useRouter();
  const { to = "/", invite } = Route.useSearch();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [shown, setShown] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = () => {
    // Полная перезагрузка: сессия ставится кукой, и данные должны запрашиваться уже с нею
    window.location.assign(to);
  };

  const request = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const result = await requestCodeFn({ data: { phone } });
      if (!result.ok) {
        setFailure(REFUSALS[result.reason] ?? "Не получилось отправить код.");
        return;
      }
      setShown(result.shown);
      setStage("code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const result = await verifyCodeFn({ data: { phone, code } });
      if (!result.ok) {
        setFailure(REFUSALS[result.reason] ?? "Код не подошёл.");
        return;
      }
      done();
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!invite) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await acceptInviteFn({ data: { token: invite } });
      if (!result.ok) {
        setFailure(
          result.reason === "expired"
            ? "Ссылка больше не действует: она живёт трое суток. Попросите новую у руководителя."
            : (REFUSALS[result.reason] ?? "Ссылка не подошла."),
        );
        return;
      }
      done();
    } finally {
      setBusy(false);
    }
  };

  void router;

  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-[420px] place-items-center px-4">
      <section className="w-full rounded-[var(--r-lg)] border border-line bg-surface p-6">
        <span className="grid size-9 place-items-center rounded-[10px] bg-orange text-[15px] font-semibold text-on-orange">
          F
        </span>
        <h1 className="mt-5 text-page-title">Вход в систему</h1>
        <p className="mt-2 text-[14px] leading-[1.5] text-text-2">
          neeklo FieldOps, пакет Фасады. Введите телефон, который завёл руководитель: пароля в
          системе нет.
        </p>

        {invite ? (
          <div className="mt-6 grid gap-3">
            <p className="text-[14px] leading-[1.5] text-text-2">
              Вас пригласили в систему. Нажмите, чтобы войти — ссылка одноразовая.
            </p>
            <Button onClick={accept} loading={busy}>
              Войти по приглашению
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-[13px] text-text-2">Телефон</span>
              <span className="relative block">
                <Phone
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <Input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+7 921 000-00-00"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label="Телефон"
                  className="pl-9"
                  disabled={stage === "code"}
                />
              </span>
            </label>

            {stage === "code" && (
              <label className="grid gap-1.5">
                <span className="text-[13px] text-text-2">Код из сообщения</span>
                <span className="relative block">
                  <KeyRound
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label="Код из сообщения"
                    className="tnum pl-9"
                  />
                </span>
              </label>
            )}

            {shown && (
              <p className="rounded-[var(--r-sm)] border border-line bg-warn-bg p-3 text-[13px] leading-[1.45] text-text">
                Отправка сообщений ещё не подключена: код показан здесь и записан в журнал сервера.
                Ваш код — <span className="tnum font-semibold">{shown}</span>
              </p>
            )}

            {failure && (
              <p className="text-[13px] leading-[1.45] text-danger" role="alert">
                {failure}
              </p>
            )}

            {stage === "phone" ? (
              <Button
                onClick={request}
                loading={busy}
                disabled={phone.replace(/\D/g, "").length < 10}
              >
                Получить код
              </Button>
            ) : (
              <div className="grid gap-2">
                <Button onClick={verify} loading={busy} disabled={code.trim().length < 4}>
                  Войти
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStage("phone");
                    setCode("");
                    setShown(null);
                    setFailure(null);
                  }}
                >
                  Изменить телефон
                </Button>
              </div>
            )}

            <p className="text-[13px] leading-[1.45] text-text-3">
              Если код не приходит, попросите руководителя прислать ссылку для входа: она действует
              трое суток.
            </p>
          </div>
        )}

        {busy && (
          <span className="sr-only" role="status">
            <Loader2 aria-hidden /> Проверяем
          </span>
        )}
      </section>
    </main>
  );
}

export const Route = createLazyFileRoute("/login")({ component: LoginPage });
