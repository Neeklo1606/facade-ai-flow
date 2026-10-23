import { completePageHead } from "@/lib/page-head";
import { useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Download, Globe, MessageCircle, RotateCcw } from "lucide-react";
import { useStartCanonScenario } from "@/components/guide/DemoScenarios";
import { AmbientField, Marker } from "@/components/gaika";
import { Button } from "@/components/ui/button";
import { DemoReset } from "@/components/layout/DemoReset";
import { contactUrl, demoShow } from "@/api/config";
import { queries } from "@/api/queries";
import { saveShiftFile, useMaterialRequests } from "@/api/capture";
import { useNow } from "@/api/clock";
import { reportStatusLabel, materialRequestStatusLabel } from "@/contracts";
import { CANON_SCENARIOS } from "@/lib/guide/scenarios";
import { useGuide } from "@/lib/guide/store";
import { recordAction } from "@/lib/guide/telemetry";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Финал показа (ADR-038): что создано за три сценария, файлы результата, пройти заново
 * и «Обсудить пилот». Живёт только в демонстрации: в рабочем контуре показа нет.
 */
export const Route = createFileRoute("/finish")({
  head: () =>
    completePageHead(
      { meta: [{ title: "Итоги показа — гайка" }] },
      "Итоги показа — гайка",
      "Сводка смены и черновик ведомости по итогам демонстрации.",
    ),
  component: FinishPage,
});

function FinishPage() {
  if (!demoShow) return <Navigate to="/app" replace />;
  return <Finish />;
}

function Finish() {
  const startCanon = useStartCanonScenario();
  const guide = useGuide();
  const now = useNow();
  const projects = useQuery(queries.projects()).data ?? [];
  const projectId =
    projects.find((item) => item.project.id === "p-korona")?.project.id ??
    projects[0]?.project.id ??
    null;
  const reports =
    useQuery({ ...queries.reports(projectId ?? ""), enabled: !!projectId }).data ?? [];
  const requests = useMaterialRequests(projectId).data ?? [];
  const report = reports.find((item) => item.report.id === guide.chain.reportId)?.report ?? null;
  const request = requests.find((item) => item.id === guide.chain.requestId) ?? null;
  const done = CANON_SCENARIOS.filter((item) => guide.finished.includes(item.id));
  const all = done.length === CANON_SCENARIOS.length;
  const [saving, setSaving] = useState(false);

  const download = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const input = { projectId, date: now.slice(0, 10), fallbackToLast: true };
      await saveShiftFile(input, "shift");
      await saveShiftFile(input, "statement");
      recordAction("downloadStatement");
    } catch (error) {
      toast.error("Файлы не собрались", { description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    {
      label: "Отчёт с площадки",
      value: report ? `${report.workType}, ${report.declaredQty} ${report.unit}` : "не создан",
      status: report ? reportStatusLabel[report.status] : null,
    },
    {
      label: "Сводка смены",
      value: report?.status === "accepted" ? "принятые объёмы, Excel" : "появится после приёмки",
      status: report?.status === "accepted" ? "готова" : null,
    },
    {
      label: "Черновик ведомости",
      value: "Черновик, не исполнительная документация",
      status: report?.status === "accepted" ? "готов" : null,
    },
    {
      label: "Заявка на материал",
      value: request ? `${request.name}, ${request.qty} ${request.unit}` : "не создана",
      status: request ? materialRequestStatusLabel[request.status] : null,
    },
  ];

  return (
    <>
      <AmbientField state={all ? "success" : "rest"} className="-mx-[var(--content-pad)] -mt-4" />
      <section className="relative flex flex-col gap-8 pt-4">
        <div className="flex flex-col gap-2">
          <Marker>Итоги показа</Marker>
          <h1 className="text-greeting">
            {all ? "Вы прошли три сценария" : `Пройдено ${done.length} из 3`}
          </h1>
          <p className="text-body text-text-2">
            Голос с объекта стал отчётом, ПТО принял его и выпустил файлы, снабжение решило по
            заявке. Всё это — в одной вкладке, на вымышленных данных.
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.label}
              className="bg-surface flex items-start gap-3 rounded-[var(--r-lg)] px-5 py-4"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                  row.status ? "bg-ok/15 text-ok" : "bg-surface-2",
                )}
              >
                {row.status ? <Check className="size-3.5" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-list block">{row.label}</span>
                <span className="text-caption text-text-2 block">{row.value}</span>
              </span>
              {row.status ? (
                <span className="text-caption text-text-3 shrink-0">{row.status}</span>
              ) : null}
            </li>
          ))}
        </ul>

        {!all ? (
          <div className="flex flex-col gap-2">
            <Marker>Осталось</Marker>
            {CANON_SCENARIOS.filter((item) => !guide.finished.includes(item.id)).map((item) => (
              // Сценарий стартует сразу со своего экрана: так же, как плитка на /demo
              <Button
                key={item.id}
                variant="secondary"
                className="justify-start"
                onClick={() => startCanon(item.id)}
              >
                {item.title}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {/* Что дальше (01_SPEC 7.3): разобрать свои данные главным действием, затем файлы */}
          <Button variant="accent" asChild>
            <Link to="/razbor" search={{ from: "demo-final" }} data-testid="finish-razbor">
              Разобрать мои данные <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            variant="secondary"
            onClick={() => void download()}
            disabled={saving || !projectId}
          >
            <Download className="size-4" /> Скачать файлы
          </Button>
          {contactUrl ? (
            <Button variant="secondary" asChild>
              <a href={contactUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> Обсудить пилот
              </a>
            </Button>
          ) : null}
          <DemoReset
            restart
            trigger={
              <Button variant="ghost">
                <RotateCcw className="size-4" /> Пройти заново
              </Button>
            }
          />
          <Button variant="ghost" asChild>
            <Link to="/">
              <Globe className="size-4" /> Вернуться на сайт
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
