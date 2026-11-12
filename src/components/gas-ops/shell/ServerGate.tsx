import type { ReactNode } from "react";
import { LogIn, ServerOff } from "lucide-react";
import { useGasHydration, useGasServerStatus } from "@/api/gas-ops";
import { EmptyBlock, SkeletonRows } from "@/components/ui/kit/states";
import { Button } from "@/components/ui/button";

/**
 * Рабочий контур (ADR-069): экраны учёта времени открываются только на снимке пользователя
 * сессии. Пока он идёт, видна загрузка; при отказе причина и вход, без исходного демо-набора.
 * В демо-сборке состояние сразу «готово», и оболочка рисуется как раньше.
 */
export function GasServerGate({ children }: { children: ReactNode }) {
  // Снимок поднимается после первой отрисовки: во вкладке из хранилища, на сервере из базы
  useGasHydration();
  const status = useGasServerStatus();
  if (status.state === "ready") return <>{children}</>;
  return (
    <main className="gas-shell grid min-h-dvh place-items-center bg-canvas px-4 text-ink">
      <div className="w-full max-w-md">
        {status.state === "loading" ? (
          <SkeletonRows rows={3} label="Загружаем учёт времени" />
        ) : (
          <div role="alert">
            <EmptyBlock
              icon={/войд|сессия|401/i.test(status.message) ? LogIn : ServerOff}
              title="Учёт времени недоступен"
              text={status.message}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <a href="/login?to=%2Fgas">Войти</a>
                  </Button>
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    Повторить
                  </Button>
                </div>
              }
            />
          </div>
        )}
      </div>
    </main>
  );
}
