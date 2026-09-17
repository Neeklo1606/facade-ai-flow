import { deliveryStatusLabel, rfqStatusLabel, type ExtractedPosition } from "@/contracts";
import {
  agentReply,
  askAgentInput,
  type AgentIntent,
  type AgentPort,
  type AgentReply,
  type AgentSource,
  type Repositories,
} from "@/ports";
import { fmtNum } from "@/shared/number-format";

/**
 * Ассистент поверх портов (ADR-006). Не читает состояние адаптера напрямую: ответы собираются
 * из тех же портов, что и экраны, поэтому цифры в ответе совпадают с карточкой объекта при любом
 * адаптере — демо или PostgreSQL. Каждый ответ ссылается на первоисточник; без него ответа нет.
 */

type DataPorts = Omit<Repositories, "agent">;

const INTENT_WORDS: [AgentIntent, RegExp][] = [
  ["deliveries", /постав|доставк|в пути|отгруз|привез/],
  ["documents_search", /найд|найти|поиск|ищ|в документ|на каком лист/],
  ["decisions", /решени|требует|внимани|согласов|что делать|срочн/],
  ["project_summary", /сводк|обзор|как дела|состояни|по объекту|статус объект/],
];

/** Слова вопроса, которые не участвуют в поиске по документам */
const STOP_WORDS = new Set([
  "найди",
  "найти",
  "покажи",
  "поиск",
  "где",
  "документах",
  "документы",
  "документации",
  "спецификации",
  "проекте",
  "объекте",
  "какие",
  "есть",
  "все",
  "для",
  "про",
]);

export function classifyIntent(prompt: string): AgentIntent | null {
  const text = prompt.toLowerCase();
  return INTENT_WORDS.find(([, words]) => words.test(text))?.[0] ?? null;
}

/** «05.09» из «2026-09-05…» */
const day = (value: string) => `${value.slice(8, 10)}.${value.slice(5, 7)}`;

/** Основа слова для поиска: «кронштейны» → «кроншт» */
const stem = (word: string) =>
  word
    .toLowerCase()
    .replace(/ё/g, "е")
    .slice(0, Math.max(4, word.length - 3));

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export function createAgentPort(ports: DataPorts): AgentPort {
  async function sourcesOf(ids: (string | null | undefined)[]): Promise<AgentSource[]> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const cards = await Promise.all(unique.map((id) => ports.reports.source(id)));
    return cards
      .filter((card) => card !== null)
      .map(({ source }) => ({
        sourceId: source.id,
        kind: source.kind,
        title: source.title,
        location: source.location,
      }));
  }

  /** Объект: из селектора, из названия в вопросе или первый в реестре — там сначала требующие внимания */
  async function pickProject(prompt: string, projectId: string | null) {
    const registry = await ports.projects.list({});
    if (projectId) {
      const selected = registry.find((item) => item.project.id === projectId);
      if (selected) return selected.project;
    }
    const text = prompt.toLowerCase();
    const named = registry.find(({ project }) =>
      project.name
        .replace(/[«»"]/g, " ")
        .split(/[\s,]+/)
        .filter((word) => word.length >= 5 && !/^(корпус|реконструкция)$/i.test(word))
        .some((word) => text.includes(stem(word))),
    );
    return (named ?? registry[0])?.project ?? null;
  }

  async function documentSources(projectId: string) {
    const documents = await ports.documents.list({ projectId });
    return sourcesOf(documents.map((item) => item.document.sourceId));
  }

  async function projectSummary(projectId: string): Promise<AgentReply | null> {
    const card = await ports.projects.card(projectId);
    if (!card) return null;
    const { project, overview: o } = card;
    const reports = await ports.reports.list(projectId);
    const text = [
      `${project.name}: ${o.stage.toLowerCase()}. Документация ${o.docVersion}: ${fmtNum(o.specTotal)} ${plural(o.specTotal, "позиция", "позиции", "позиций")}, не проверено ${fmtNum(o.specUnverified)}.`,
      `Закупки: активных запросов ${o.activeRequests}, ${o.overdueRequests ? `просрочено ответов ${o.overdueRequests}` : "просроченных ответов нет"}. В пути ${fmtNum(o.inTransit)}, поставлено ${fmtNum(o.delivered)} ${plural(o.delivered, "позиция", "позиции", "позиций")}.`,
    ];
    if (o.openChanges || o.missingReports) {
      text.push(
        [
          o.openChanges ? `неразобранных изменений документации — ${o.openChanges}` : null,
          o.missingReports
            ? `нет отчёта с площадки от ${o.missingReports} ${plural(o.missingReports, "бригады", "бригад", "бригад")}`
            : null,
        ]
          .filter(Boolean)
          .join(", ")
          .replace(/^./, (first) => first.toUpperCase()) + ".",
      );
    }
    const sources = [
      ...(await documentSources(projectId)).slice(0, 2),
      ...(await sourcesOf([reports[0]?.report.sourceId])),
    ];
    return {
      intent: "project_summary",
      projectId,
      text,
      facts: [
        { label: "Позиций в спецификации", value: fmtNum(o.specTotal) },
        { label: "Не проверено", value: fmtNum(o.specUnverified) },
        { label: "Просрочено ответов", value: fmtNum(o.overdueRequests) },
        { label: "В пути", value: fmtNum(o.inTransit) },
      ],
      sources,
    };
  }

  async function deliveries(projectId: string): Promise<AgentReply | null> {
    const [items, requests, counterparties, card] = await Promise.all([
      ports.procurement.deliveries(projectId),
      ports.procurement.requests(projectId),
      ports.directory.counterparties(),
      ports.projects.card(projectId),
    ]);
    if (!card) return null;
    const o = card.overview;
    const supplier = (id: string) =>
      counterparties.find((item) => item.id === id)?.name ?? "поставщик";
    const expected = items
      .filter((item) => item.status === "expected" || item.status === "in_transit")
      .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt));
    const received = items.filter((item) => item.status === "received");
    const waiting = requests.filter(
      (item) => item.status === "collecting" || item.status === "overdue" || item.status === "sent",
    );
    const overdue = requests.filter((item) => item.status === "overdue");

    // Позиции по этапам — те же числа, что в карточке объекта; поставки — записи о приёмке
    const text: string[] = [
      `По позициям спецификации: заказано ${fmtNum(o.ordered)}, в пути ${fmtNum(o.inTransit)}, поставлено ${fmtNum(o.delivered)}.`,
    ];
    if (expected.length) {
      const next = expected[0]!;
      text.push(
        `Ожидается ${expected.length} ${plural(expected.length, "поставка", "поставки", "поставок")}. Ближайшая — ${supplier(next.supplierId)}, ${day(next.expectedAt)}, ${deliveryStatusLabel[next.status].toLowerCase()}: ${next.items.map((line) => `${line.name} ${fmtNum(line.qty)} ${line.unit}`).join(", ")}.`,
      );
    }
    if (received.length) {
      const last = [...received].sort((a, b) =>
        (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""),
      )[0]!;
      text.push(
        `Принято поставок: ${received.length}, последняя — ${supplier(last.supplierId)}${last.receivedAt ? `, ${day(last.receivedAt)}` : ""}.`,
      );
    }
    if (waiting.length) {
      text.push(
        `Ждём ответов по ${waiting.length} ${plural(waiting.length, "запросу", "запросам", "запросам")}: ${waiting.map((item) => `${item.request.number} — ${rfqStatusLabel[item.status].toLowerCase()}`).join("; ")}.`,
      );
    }
    if (overdue.length) {
      text.push(
        `Срок ответа прошёл по ${overdue.map((item) => item.request.number).join(", ")} — стоит напомнить поставщикам.`,
      );
    }

    // Источники: письма и сообщения о поставках, иначе — предложения по ожидающим запросам
    const cards = await Promise.all(
      [...waiting, ...requests]
        .slice(0, 3)
        .map((item) => ports.procurement.request(item.request.id)),
    );
    const sources = await sourcesOf([
      ...expected.map((item) => item.sourceId),
      ...received.map((item) => item.sourceId),
      ...cards.flatMap((card) => card?.offers.map((offer) => offer.sourceId) ?? []),
    ]);
    return {
      intent: "deliveries",
      projectId,
      text,
      facts: [
        { label: "Позиций в пути", value: fmtNum(o.inTransit) },
        { label: "Поставлено позиций", value: fmtNum(o.delivered) },
        { label: "Запросов ждут ответа", value: fmtNum(waiting.length) },
      ],
      sources: sources.slice(0, 3),
    };
  }

  async function documentsSearch(
    projectId: string,
    projectName: string,
    prompt: string,
  ): Promise<AgentReply | null> {
    // Слова названия объекта — это выбор объекта, а не предмет поиска
    const nameStems = projectName
      .toLowerCase()
      .split(/[^a-zа-яё0-9]+/i)
      .filter((word) => word.length >= 5)
      .map(stem);
    const terms = prompt
      .toLowerCase()
      .split(/[^a-zа-яё0-9-]+/i)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
      .filter((word) => !nameStems.some((name) => word.startsWith(name)))
      .map(stem);
    const documents = await ports.documents.list({ projectId });

    // Все действующие позиции объекта страницами по 200 — так же, как их получает экран
    const positions: ExtractedPosition[] = [];
    let cursor: string | null = null;
    do {
      const page = await ports.positions.list({
        projectId,
        limit: 200,
        cursor,
        view: "active",
        order: "position",
      });
      positions.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    const found = terms.length
      ? positions.filter((item) => {
          const name = item.projectName.toLowerCase().replace(/ё/g, "е");
          return terms.every((term) => name.includes(term));
        })
      : [];
    const byRevision = new Map(documents.map((item) => [item.document.id, item.document]));
    const query = prompt
      .replace(/^\s*(найди|найти|покажи)\s+/i, "")
      .replace(/^в\s+документ[а-яё]*\s+/i, "")
      .trim();
    const unparsed = documents.filter((item) => !item.loaded);

    if (!found.length) {
      return {
        intent: "documents_search",
        projectId,
        text: [
          !terms.length
            ? "Уточните, что найти: название материала или изделия, например «кронштейны» или «керамогранит»."
            : !positions.length && unparsed.length
              ? `Позиции документации ${projectName} ещё не разобраны построчно, поэтому искать по ним пока нечего. В реестре документов — ${documents.length} ${plural(documents.length, "документ", "документа", "документов")}.`
              : `В действующих ревизиях документации не нашёл «${query}». Проверил ${fmtNum(positions.length)} ${plural(positions.length, "позицию", "позиции", "позиций")} в ${documents.length} ${plural(documents.length, "документе", "документах", "документах")}.`,
        ],
        facts: [],
        sources: (await documentSources(projectId)).slice(0, 2),
      };
    }

    const total = found.reduce(
      (sum, item) => (item.unit === found[0]!.unit ? sum + item.qty : sum),
      0,
    );
    const sameUnit = found.every((item) => item.unit === found[0]!.unit);
    const revisions = [...new Set(found.map((item) => item.documentId))];
    return {
      intent: "documents_search",
      projectId,
      text: [
        `Нашёл ${found.length} ${plural(found.length, "позицию", "позиции", "позиций")} по запросу «${query}» в ${revisions.map((id) => `«${byRevision.get(id)?.title ?? "документе"}», ${byRevision.get(id)?.version ?? ""}`.trim()).join("; ")}.${sameUnit ? ` Всего ${fmtNum(total, total % 1 ? 3 : 0)} ${found[0]!.unit}.` : ""}`,
        found.length > 5
          ? "Первые пять — ниже, остальные в разделе «Документация»."
          : "Все позиции — ниже.",
      ],
      facts: found.slice(0, 5).map((item) => ({
        label: `${item.position} ${item.projectName}`,
        value: `${fmtNum(item.qty, item.qty % 1 ? 3 : 0)} ${item.unit}`,
      })),
      sources: await sourcesOf(revisions.map((id) => byRevision.get(id)?.sourceId)),
    };
  }

  async function decisions(projectId: string): Promise<AgentReply | null> {
    const [pending, card, reports] = await Promise.all([
      ports.timeline.pending(projectId),
      ports.projects.card(projectId),
      ports.reports.list(projectId),
    ]);
    const inReview = reports.filter((item) => item.report.status === "review");
    const requestIds = pending.filter((item) => item.kind === "request").map((item) => item.id);
    const text: string[] = [];
    if (pending.length) {
      text.push(
        `Ждут решения: ${pending.map((item) => item.title.replace(/^./, (c) => c.toLowerCase())).join("; ")}.`,
      );
    }
    if (inReview.length) {
      text.push(
        `На проверке ${inReview.length} ${plural(inReview.length, "отчёт", "отчёта", "отчётов")} с площадки — от ${day(inReview[inReview.length - 1]!.report.sentAt)} до ${day(inReview[0]!.report.sentAt)}.`,
      );
    }
    if (card?.overview.specUnverified) {
      text.push(
        `Без проверки ${fmtNum(card.overview.specUnverified)} ${plural(card.overview.specUnverified, "позиция", "позиции", "позиций")} спецификации — они не уйдут в запросы поставщикам.`,
      );
    }
    if (!text.length) text.push("Решений, которые ждут вас по объекту, сейчас нет.");

    const requestCards = await Promise.all(requestIds.map((id) => ports.procurement.request(id)));
    const sources = await sourcesOf([
      ...requestCards.flatMap((item) => item?.offers.map((offer) => offer.sourceId) ?? []),
      ...inReview.map((item) => item.report.sourceId),
    ]);
    return {
      intent: "decisions",
      projectId,
      text,
      facts: [
        { label: "Выбрать поставщика", value: fmtNum(requestIds.length) },
        { label: "Замены материалов", value: fmtNum(pending.length - requestIds.length) },
        { label: "Отчётов на проверке", value: fmtNum(inReview.length) },
      ],
      sources: sources.length
        ? sources.slice(0, 3)
        : (await documentSources(projectId)).slice(0, 1),
    };
  }

  return {
    ask: async (raw) => {
      const input = askAgentInput.parse(raw);
      const intent = input.intent ?? classifyIntent(input.prompt);
      if (!intent) return null;
      const project = await pickProject(input.prompt, input.projectId);
      if (!project) return null;
      const reply =
        intent === "project_summary"
          ? await projectSummary(project.id)
          : intent === "deliveries"
            ? await deliveries(project.id)
            : intent === "documents_search"
              ? await documentsSearch(project.id, project.name, input.prompt)
              : await decisions(project.id);
      // Ответ без первоисточника не отдаётся (ADR-006)
      if (!reply || !reply.sources.length) return null;
      return agentReply.parse(reply);
    },
  };
}
