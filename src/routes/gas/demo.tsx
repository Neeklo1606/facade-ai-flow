import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { completePageHead } from "@/lib/page-head";
import { useGasActor, useGasDirectory, useGasEntries, fmtHours, fmtRub } from "@/api/gas-ops";
import { useGasWorkCost, useGasReviewPolicy, useGasEstimateActions } from "@/api/gas-estimates";
import { demoWorkspaceEnabled, DEMO_OBJECT_STATUS } from "@/api/gas-demo-workflow";
import { AddObject } from "@/components/gas-ops/directory/AddObject";
import { AssignBrigade } from "@/components/gas-ops/workspace/AssignBrigade";
import { EditDemoObject } from "@/components/gas-ops/workspace/EditDemoObject";
const AllocationPreview = lazy(() =>
  import("@/components/gas-ops/workspace/AllocationPreview").then((module) => ({
    default: module.AllocationPreview,
  })),
);
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/gas/demo")({
  validateSearch: (search: Record<string, unknown>): { object?: string } =>
    typeof search["object"] === "string" ? { object: search["object"] } : {},
  head: () =>
    completePageHead(
      { meta: [{ title: "Сценарий на ваших данных · ГАЙКА" }] },
      "Сценарий на ваших данных · ГАЙКА",
      "Подготовка демонстрации на загруженных сметах, объектах и бригадах.",
    ),
  component: DemoWorkspace,
});
function DemoWorkspace() {
  const actor = useGasActor();
  const policy = useGasReviewPolicy();
  const estimateActions = useGasEstimateActions();
  const [reviewBusy, setReviewBusy] = useState(false);
  const [showAllocation, setShowAllocation] = useState(false);
  const directory = useGasDirectory();
  const { rows } = useGasWorkCost();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const id = search["object"] ?? directory.objects[0]?.id ?? "";
  const row = rows.find((r) => r.object.id === id);
  const entries = useGasEntries({}).filter((entry) => entry.entry.objectId === id);
  if (!["manager", "admin", "director"].includes(actor.role))
    return <p className="text-body">Подготовка показа доступна менеджеру и руководителю.</p>;
  if (!demoWorkspaceEnabled)
    return (
      <p className="text-body">
        Это рабочий контур. Демонстрационные проекты не изменяют серверные данные. Используйте
        основные разделы.
      </p>
    );
  const version = row?.versions[0] ?? null;
  const confirmed = entries.filter((e) => e.entry.status === "confirmed");
  const pending = entries.filter((e) => e.entry.status === "pending");
  return (
    <div
      className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-5"
      data-testid="demo-workspace"
    >
      <header>
        <h2 className="text-page-title">Сценарий на ваших данных</h2>
        <p className="mt-2 text-body text-text-2">
          Демонстрационный режим. Сметы и изменения сохраняются в этом браузере. Этот экран не
          сбрасывает загруженные данные.
        </p>
      </header>
      <nav aria-label="Шаги демонстрации" className="surface-1 flex flex-wrap gap-2 p-3">
        {[
          ["/gas/estimates", "1. Смета"],
          ["/gas/objects", "2. Объект"],
          ["/gas/brigades", "3. Бригада"],
          ["/gas/brigade", "4. Время"],
          ["/gas/moderation", "5. Проверка"],
          ["/gas/tabel", "6. Табель и Excel"],
        ].map(([to, label]) => (
          <Button key={to} variant="quiet" asChild>
            <Link to={to!}>{label}</Link>
          </Button>
        ))}
      </nav>
      <section className="surface-1 p-card">
        <h2 className="text-heading">Подтверждение сотрудником</h2>
        <p className="mt-2 text-body text-text-2">
          {policy.settings.mode === "all"
            ? "Все новые записи направляются менеджеру на проверку."
            : "Включён автоприём части записей. Для показа ручной проверки переключите режим."}
        </p>
        {(actor.role === "manager" || actor.isAdmin) && policy.settings.mode !== "all" ? (
          <Button
            className="mt-3"
            variant="secondary"
            disabled={reviewBusy}
            onClick={() => {
              setReviewBusy(true);
              void estimateActions
                .setReviewSettings({ ...policy.settings, mode: "all" })
                .then((result) => {
                  if (result.ok) toast.success("Все новые записи будут ждать проверки");
                  else toast.error(result.message);
                })
                .finally(() => setReviewBusy(false));
            }}
          >
            Направлять все записи на проверку
          </Button>
        ) : null}
      </section>
      <section className="surface-1 min-w-0 p-card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-meta">
            Объект для демонстрации
            <select
              className="h-12 w-full rounded-control border border-line bg-surface px-3 text-body"
              value={id}
              onChange={(e) => void navigate({ search: { object: e.target.value }, replace: true })}
            >
              <option value="">Выберите объект</option>
              {directory.objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {o.label}
                </option>
              ))}
            </select>
          </label>
          {actor.role === "manager" || actor.isAdmin ? <AddObject /> : null}
        </div>
        {row ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <AssignBrigade key={id} objectId={id} />
              <EditDemoObject objectId={id} />
            </div>
            <h3 className="mt-4 text-heading">{row.object.label}</h3>
            <p className="text-meta text-text-2">
              {row.object.code} · {row.object.workType ?? "Вид работ не указан"} ·{" "}
              {DEMO_OBJECT_STATUS[row.object.demoStatus ?? "active"]}
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-meta text-text-3">Смета</dt>
                <dd className="text-body">
                  {version
                    ? `${version.fileName}, версия ${version.version}${version.confirmedAt ? ", подтверждена" : ", ждёт подтверждения"}`
                    : "Не загружена. Загрузите файл и выберите этот объект"}
                </dd>
              </div>
              <div>
                <dt className="text-meta text-text-3">Стоимость работ объекта</dt>
                <dd className="text-body">
                  {row.costRub === null ? "Нет подтверждённой стоимости" : fmtRub(row.costRub)}
                </dd>
              </div>
              <div>
                <dt className="text-meta text-text-3">На проверке</dt>
                <dd className="text-body">{pending.length} записей</dd>
              </div>
              <div>
                <dt className="text-meta text-text-3">Принятые часы</dt>
                <dd className="text-body">
                  {fmtHours(confirmed.reduce((sum, e) => sum + e.entry.minutes, 0) / 60)} ·{" "}
                  {confirmed.length} записей
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-meta text-text-3">
              Текущий табель использует действующее распределение стоимости по минутам. Проект по
              разделам ниже показывает отдельный будущий сценарий.
            </p>
          </>
        ) : (
          <p className="mt-3 text-body">
            Создайте объект или выберите существующий из справочника.
          </p>
        )}
      </section>
      {row && row.versions.length > 0 ? (
        <section className="surface-1 p-card">
          <h2 className="text-heading">Сметы и версии объекта</h2>
          <ul className="mt-3 divide-y divide-line">
            {row.versions.map((version) => (
              <li
                key={version.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="min-w-0 break-words text-body">
                  {version.fileName} · версия {version.version} ·{" "}
                  {version.confirmedAt ? "подтверждена" : "на проверке"}
                </span>
                <Button variant="secondary" asChild>
                  <Link to="/gas/estimates" search={{ open: version.id }}>
                    Открыть смету
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {version ? (
        showAllocation ? (
          <Suspense
            fallback={
              <p role="status" className="surface-1 p-card text-body">
                Открываю проект начислений…
              </p>
            }
          >
            <AllocationPreview key={`${id}:${version.id}`} version={version} />
          </Suspense>
        ) : (
          <section className="surface-1 p-card">
            <h2 className="text-heading">Проект начислений по разделам</h2>
            <p className="mt-2 text-body text-text-2">
              Дополнительный демонстрационный сценарий СМР, опрессовки и частичного выполнения. Не
              меняет утверждённый отчёт.
            </p>
            <Button variant="secondary" className="mt-3" onClick={() => setShowAllocation(true)}>
              Открыть проект начислений
            </Button>
          </section>
        )
      ) : (
        <section className="surface-1 p-card">
          <h2 className="text-heading">Начните со сметы</h2>
          <p className="mt-2 text-body text-text-2">
            Загрузите свой Excel в разделе смет, проверьте распознанные строки и привяжите к
            выбранному объекту. Здесь появятся его разделы.
          </p>
          <Button className="mt-3" variant="secondary" asChild>
            <Link to="/gas/estimates">Открыть загрузку сметы</Link>
          </Button>
        </section>
      )}
      <section className="surface-1 p-card">
        <h2 className="text-heading">Что показывать заказчику</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-body">
          <li>Загрузите смету, проверьте строки и подтвердите привязку к объекту.</li>
          <li>Создайте бригаду с составом и назначьте её на объект в нужный день.</li>
          <li>Откройте «Время», выберите бригаду и объект, заполните интервал и отправьте.</li>
          <li>Менеджер принимает запись в «Проверке». Часы участвуют в табеле без переноса.</li>
          <li>В табеле выберите период, откройте таблицу на весь экран и выгрузите Excel.</li>
          <li>Отдельно покажите проект СМР и опрессовки на разделах своей сметы.</li>
        </ol>
      </section>
      <section className="surface-1 p-card">
        <h2 className="text-heading">MAX, Telegram и голос</h2>
        <p className="mt-2 text-body text-text-2">
          Для показа используйте симулятор бота: он создаёт настоящую запись в этой демонстрации.
          Сообщение не отправляется в MAX или Telegram. Голос требует подключения транскрипции;
          финансовые суммы подтверждает сотрудник.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link to="/gas/foreman">Открыть симулятор бота</Link>
          </Button>
          <Button variant="quiet" asChild>
            <Link to="/gas/admin">Состояние подключений</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
