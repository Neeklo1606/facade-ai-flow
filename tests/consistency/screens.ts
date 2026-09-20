/**
 * Согласованность цифр между экранами (ADR-013, п. 2). Данные берутся через порты — те же
 * вызовы, что делают экраны: реестр, карточка объекта, материалы, документация, закупки,
 * поставки, дашборд. Функция возвращает список расхождений; пустой список — цифры сходятся.
 */
import { dashboardMetrics, attentionRows, type DashboardSource } from "@/domain/dashboard";
import { isActiveRequest } from "@/domain/procurement";
import { fmtNum } from "@/lib/format";
import type { Repositories } from "@/ports";

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

function byUnit(rows: { qty: number; unit: string }[]) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.unit, (map.get(row.unit) ?? 0) + row.qty);
  return map;
}

function sameUnits(a: Map<string, number>, b: Map<string, number>) {
  const units = new Set([...a.keys(), ...b.keys()]);
  return [...units].every((unit) => Math.abs((a.get(unit) ?? 0) - (b.get(unit) ?? 0)) < 1e-6);
}

const show = (map: Map<string, number>) =>
  [...map].map(([unit, qty]) => `${fmtNum(qty)} ${unit}`).join(", ") || "—";

/** Все позиции объекта: список отдаётся страницами, как на экране материалов */
export async function allPositions(repos: Repositories, projectId: string) {
  const items = [];
  let cursor: string | null = null;
  do {
    const page = await repos.positions.list({ projectId, limit: 200, cursor });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export async function consistencyIssues(repos: Repositories): Promise<string[]> {
  const issues: string[] = [];
  const expect = (ok: boolean, message: string) => {
    if (!ok) issues.push(message);
  };
  const now = await repos.clock.now();
  const registry = await repos.projects.list();
  const allDocuments = await repos.documents.list({});

  const cards = [];
  const requestRows = [];
  let pendingTotal = 0;

  for (const row of registry) {
    const id = row.project.id;
    const name = row.project.name;
    const card = await repos.projects.card(id);
    if (!card) {
      issues.push(`${name}: объект есть в реестре, но карточка не открывается`);
      continue;
    }
    cards.push(card);
    const overview = card.overview;

    // Реестр и карточка объекта показывают одну сводку
    expect(
      JSON.stringify(row.overview) === JSON.stringify(overview),
      `${name}: сводка в реестре и в карточке объекта различается`,
    );

    // Карточка объекта и материалы: всего, проверено, не проверено. Если позиции объекта
    // не загружены (R20), карточка считает по счётчикам документации, а материалы пусты
    const facets = await repos.positions.facets({ projectId: id });
    const { views } = facets;
    const stage = (key: keyof typeof facets.stages) => facets.stages[key] ?? 0;
    const stages = {
      requested: stage("requested"),
      offers: stage("offers"),
      supplier_selected: stage("supplier_selected"),
      ordered: stage("ordered"),
      delivered: stage("delivered"),
    };
    const documents = allDocuments.filter((doc) => doc.document.projectId === id);
    const loaded = documents.some((doc) => doc.loaded && doc.extracted > 0);
    pendingTotal += loaded ? views.pending : overview.specUnverified;
    if (!loaded) {
      expect(views.all === 0, `${name}: позиции не загружены, а материалы показывают ${views.all}`);
    } else {
      expect(
        overview.specTotal === views.active,
        `${name}: позиций в карточке ${overview.specTotal}, в материалах ${views.active}`,
      );
      expect(
        overview.specUnverified === views.pending,
        `${name}: непроверенных в карточке ${overview.specUnverified}, в материалах ${views.pending}`,
      );
    }
    expect(
      views.verified + views.pending === views.active,
      `${name}: проверено ${views.verified} + не проверено ${views.pending} ≠ всего ${views.active}`,
    );
    expect(
      sum(facets.groups.map((g) => g.total)) === views.active,
      `${name}: сумма по разделам материалов не равна числу позиций`,
    );
    expect(
      sum(facets.groups.map((g) => g.verified)) === views.verified,
      `${name}: сумма проверенных по разделам не равна числу проверенных`,
    );

    // Этапы закупки считаются по переданным в закупку; карточка считает «дошло до этапа»
    const handedOver = views.verified - facets.handOver.count;
    expect(
      sum(Object.values(facets.stages)) === handedOver,
      `${name}: сумма этапов закупки ${sum(Object.values(facets.stages))} ≠ переданных в закупку ${handedOver}`,
    );
    const reached = {
      inRequests:
        stages.requested +
        stages.offers +
        stages.supplier_selected +
        stages.ordered +
        stages.delivered,
      offersReceived: stages.offers + stages.supplier_selected + stages.ordered + stages.delivered,
      ordered: stages.ordered + stages.delivered,
      delivered: stages.delivered,
    };
    for (const [key, value] of Object.entries(reached)) {
      const shown = overview[key as keyof typeof reached];
      expect(
        shown === value,
        `${name}: «${key}» в карточке ${shown}, по этапам материалов ${value}`,
      );
    }

    // Документация: счётчики действующих ревизий против карточки
    expect(
      sum(documents.map((doc) => doc.extracted)) === overview.specTotal,
      `${name}: извлечено по документам ${sum(documents.map((d) => d.extracted))}, в карточке ${overview.specTotal}`,
    );
    expect(
      sum(documents.map((doc) => doc.verified)) === overview.specTotal - overview.specUnverified,
      `${name}: проверено по документам и в карточке различается`,
    );

    // Закупки: активные и просроченные запросы
    const requests = await repos.procurement.requests(id);
    requestRows.push(...requests);
    const overdue = requests.filter((r) => r.status === "overdue").length;
    expect(
      overview.overdueRequests === overdue,
      `${name}: просрочено в карточке ${overview.overdueRequests}, в списке запросов ${overdue}`,
    );
    const active = requests.filter((r) => isActiveRequest(r.request)).length;
    expect(
      overview.activeRequests === active,
      `${name}: активных запросов в карточке ${overview.activeRequests}, в списке ${active}`,
    );

    // Строка запроса — сумма позиций, из которых она собрана (та же единица)
    const positions = await allPositions(repos, id);
    for (const summary of requests) {
      const linked = positions.filter((p) => p.requestIds.includes(summary.request.id));
      if (!linked.length) continue;
      const lines = byUnit(summary.request.items);
      const fromPositions = byUnit(linked);
      expect(
        sameUnits(lines, fromPositions),
        `${name}: запрос ${summary.request.number} — в строках ${show(lines)}, в позициях ${show(fromPositions)}`,
      );
    }

    // Поставки: к приёмке и открытые замечания
    const deliveries = await repos.procurement.deliveries(id);
    const arrived = deliveries.filter((d) => d.status === "arrived").length;
    expect(
      overview.deliveriesToAccept === arrived,
      `${name}: к приёмке в карточке ${overview.deliveriesToAccept}, в списке поставок ${arrived}`,
    );
    let openRemarks = 0;
    for (const delivery of deliveries) {
      const deliveryCard = await repos.procurement.delivery(delivery.id);
      openRemarks += deliveryCard?.remarks.filter((r) => r.status === "open").length ?? 0;
    }
    expect(
      overview.openRemarks === openRemarks,
      `${name}: открытых замечаний в карточке ${overview.openRemarks}, в поставках ${openRemarks}`,
    );

    // Сопоставление (ADR-014): нормализованное имя — имя материала справочника; в запросе
    // только подтверждённое; подтверждённое — с автором
    const materials = new Map((await repos.positions.materials()).map((m) => [m.id, m]));
    for (const position of positions) {
      const material = position.materialId ? materials.get(position.materialId) : null;
      expect(
        (position.materialId === null) === (position.matchStatus === "none"),
        `${name}: позиция ${position.position} — материал и состояние сопоставления расходятся`,
      );
      expect(
        (material?.name ?? null) === position.normalizedName,
        `${name}: позиция ${position.position} — нормализованное имя не совпадает со справочником`,
      );
      if (position.requestIds.length) {
        expect(
          position.matchStatus === "confirmed",
          `${name}: позиция ${position.position} в запросе без подтверждённого сопоставления`,
        );
      }
      if (position.matchStatus === "confirmed") {
        expect(
          position.matchedBy !== null,
          `${name}: у подтверждённого сопоставления поз. ${position.position} нет автора`,
        );
      }
    }

    // Поставлено — значит поставлено полностью
    for (const position of positions) {
      if (position.purchase !== "delivered") continue;
      expect(
        (position.deliveredQty ?? 0) >= position.qty,
        `${name}: позиция ${position.position} «поставлено», но принято ${position.deliveredQty ?? 0} из ${position.qty}`,
      );
    }
  }

  // Дашборд: метрики — суммы по объектам, очередь — по спискам запросов
  const source: DashboardSource = {
    now,
    period: "week",
    projects: registry,
    documents: allDocuments,
    cards,
    requests: requestRows,
    pending: [],
    events: [],
  };
  const metrics = dashboardMetrics(source);
  const metric = (key: string) => metrics.find((m) => m.key === key)?.value;
  expect(
    metric("unverified") === fmtNum(pendingTotal),
    `дашборд: ждёт проверки ${metric("unverified")}, по материалам объектов ${fmtNum(pendingTotal)}`,
  );
  // «Заявок без ответа» — запросы, которые на экранах закупок ждут ответов и не получили ни одного
  const silentRows = requestRows.filter(
    (r) =>
      (r.status === "sent" || r.status === "collecting" || r.status === "overdue") &&
      r.answered === 0,
  ).length;
  expect(
    metric("silent") === fmtNum(silentRows),
    `дашборд: заявок без ответа ${metric("silent")}, в списках запросов ждут ответа без единого ответа ${silentRows}`,
  );
  const overdueRows = requestRows.filter((r) => r.status === "overdue").length;
  expect(
    metric("overdue") === fmtNum(overdueRows),
    `дашборд: просроченных ответов ${metric("overdue")}, в списках запросов ${overdueRows}`,
  );
  const overdueAttention = attentionRows(source).filter((r) => r.id.startsWith("overdue-")).length;
  expect(
    overdueAttention === overdueRows,
    `дашборд: в очереди «Требует решения» просроченных ${overdueAttention}, в списках ${overdueRows}`,
  );

  return issues;
}
