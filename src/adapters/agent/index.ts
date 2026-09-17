import {
  deliveryStatusLabel,
  rfqStatusLabel,
  type ExtractedPosition,
  type Project,
} from "@/contracts";
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
/** Ответ сценария до того, как к нему добавлена пометка об области */
type Draft = Omit<AgentReply, "scopeNote">;

/**
 * Сценарий по словам вопроса. Слова сравниваются с началом слова, а не с подстрокой:
 * «жилище» не превращается в поиск, «пицца» не становится поставкой без слова «поставка».
 */
const INTENT_WORDS: [AgentIntent, string[]][] = [
  ["deliveries", ["поставк", "поставок", "отгрузк", "в пути"]],
  ["documents_search", ["найди", "найти", "найдите", "поиск", "ищи", "ищу"]],
  ["decisions", ["решени", "согласова", "требует внимания", "требуют внимания"]],
  ["project_summary", ["сводк", "обзор", "состояние объекта", "статус объекта"]],
];

/** Слова вопроса, которые не участвуют в поиске по документам */
const STOP_WORDS = new Set([
  "найди",
  "найти",
  "найдите",
  "покажи",
  "поиск",
  "ищи",
  "ищу",
  "где",
  "документах",
  "документы",
  "документации",
  "спецификации",
  "проекте",
  "объекте",
  "объекту",
  "какие",
  "есть",
  "все",
  "для",
  "про",
]);

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9-]+/i)
    .filter(Boolean);

export function classifyIntent(prompt: string): AgentIntent | null {
  const tokens = words(prompt);
  const text = ` ${tokens.join(" ")} `;
  const hit = INTENT_WORDS.find(([, keys]) =>
    keys.some((key) =>
      key.includes(" ") ? text.includes(` ${key}`) : tokens.some((token) => token.startsWith(key)),
    ),
  );
  return hit?.[0] ?? null;
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

/** Слова названий, которые встречаются в вопросах не как имя объекта */
const GENERIC_NAME_WORDS = new Set([
  "корпус",
  "квартал",
  "фасада",
  "фасад",
  "реконструкция",
  "северная",
  "северный",
]);

/** Предохранитель постраничной загрузки: адаптер не должен зациклить ассистента */
const MAX_PAGES = 100;

function dedupe(sources: AgentSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.sourceId)) return false;
    seen.add(source.sourceId);
    return true;
  });
}

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

  /**
   * Основы названия объекта для узнавания в вопросе: слово без окончания, но не короче 5 букв,
   * без общих слов. «Корона» → «корон»: «Короне» узнаётся, «короб» — нет.
   */
  const projectStems = (project: Project) =>
    words(project.name.replace(/[«»"]/g, " "))
      .filter((word) => word.length >= 5 && !GENERIC_NAME_WORDS.has(word))
      .map((word) => word.slice(0, Math.max(5, word.length - 2)));

  /**
   * Объект ответа. Названный в вопросе важнее селектора; без обоих — первый в реестре
   * (там сначала требующие внимания), и ответ об этом предупреждает.
   */
  async function pickProject(prompt: string, projectId: string | null) {
    const registry = await ports.projects.list({});
    const tokens = words(prompt);
    const named = registry.find(({ project }) =>
      projectStems(project).some((part) => tokens.some((token) => token.startsWith(part))),
    );
    if (named) return { project: named.project, scopeNote: null };
    const selected = projectId ? registry.find((item) => item.project.id === projectId) : null;
    if (selected) return { project: selected.project, scopeNote: null };
    const first = registry[0]?.project;
    if (!first) return null;
    return {
      project: first,
      scopeNote: `Объект не выбран — отвечаю по объекту, который больше всего требует внимания: ${first.name}. Другой объект можно выбрать слева или назвать в вопросе.`,
    };
  }

  async function documentSources(projectId: string) {
    const documents = await ports.documents.list({ projectId });
    return sourcesOf(documents.map((item) => item.document.sourceId));
  }

  /** Письма с предложениями по запросам: у самого предложения или у строк сравнения */
  async function requestSources(requestIds: string[]) {
    const cards = await Promise.all(requestIds.map((id) => ports.procurement.request(id)));
    return sourcesOf(
      cards.flatMap((card) =>
        card
          ? [
              ...card.offers.map((offer) => offer.sourceId),
              ...card.comparison.columns.flatMap((column) =>
                Object.values(column.cells).map((cell) => cell.sourceId),
              ),
            ]
          : [],
      ),
    );
  }

  async function projectSummary(project: Project): Promise<Draft | null> {
    const card = await ports.projects.card(project.id);
    if (!card) return null;
    const o = card.overview;
    const reports = await ports.reports.list(project.id);
    const text = [
      `${project.name}: ${o.stage.toLowerCase()}. Документация ${o.docVersion}: ${fmtNum(o.specTotal)} ${plural(o.specTotal, "позиция", "позиции", "позиций")}, не проверено ${fmtNum(o.specUnverified)}.`,
      `Закупки: активных запросов ${o.activeRequests}, ${o.overdueRequests ? `просрочено ответов ${o.overdueRequests}` : "просроченных ответов нет"}. В пути ${fmtNum(o.inTransit)}, поставлено ${fmtNum(o.delivered)} ${plural(o.delivered, "позиция", "позиции", "позиций")}.`,
    ];
    const extra = [
      o.openChanges ? `неразобранных изменений документации — ${o.openChanges}` : null,
      o.missingReports
        ? `нет отчёта с площадки от ${o.missingReports} ${plural(o.missingReports, "бригады", "бригад", "бригад")}`
        : null,
    ].filter(Boolean);
    if (extra.length) {
      text.push(extra.join(", ").replace(/^./, (first) => first.toUpperCase()) + ".");
    }
    return {
      intent: "project_summary",
      projectId: project.id,
      projectName: project.name,
      text,
      facts: [
        { label: "Позиций в спецификации", value: fmtNum(o.specTotal) },
        { label: "Не проверено", value: fmtNum(o.specUnverified) },
        { label: "Просрочено ответов", value: fmtNum(o.overdueRequests) },
        { label: "В пути", value: fmtNum(o.inTransit) },
      ],
      sources: dedupe([
        ...(await documentSources(project.id)).slice(0, 2),
        ...(await sourcesOf([reports[0]?.report.sourceId])),
      ]),
    };
  }

  async function deliveries(project: Project): Promise<Draft | null> {
    const [items, requests, counterparties, card] = await Promise.all([
      ports.procurement.deliveries(project.id),
      ports.procurement.requests(project.id),
      ports.directory.counterparties(),
      ports.projects.card(project.id),
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
      `${project.name}, позиции спецификации: заказано ${fmtNum(o.ordered)}, в пути ${fmtNum(o.inTransit)}, поставлено ${fmtNum(o.delivered)}.`,
    ];
    if (!items.length && !requests.length) {
      text.push("Запросов поставщикам и поставок по объекту пока нет.");
    }
    if (expected.length) {
      const next = expected[0]!;
      text.push(
        `${expected.length === 1 ? "Ожидается" : "Ожидаются"} ${expected.length} ${plural(expected.length, "поставка", "поставки", "поставок")}. Ближайшая — ${supplier(next.supplierId)}, ${day(next.expectedAt)}, ${deliveryStatusLabel[next.status].toLowerCase()}: ${next.items.map((line) => `${line.name} ${fmtNum(line.qty)} ${line.unit}`).join(", ")}.`,
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

    // Источники: письма о поставках и предложения поставщиков; без них — спецификация,
    // из которой считаются этапы позиций
    const sources = dedupe([
      ...(await sourcesOf([...expected, ...received].map((item) => item.sourceId))),
      ...(await requestSources(
        [...waiting, ...requests].slice(0, 3).map((item) => item.request.id),
      )),
    ]).slice(0, 3);
    return {
      intent: "deliveries",
      projectId: project.id,
      projectName: project.name,
      text,
      facts: [
        { label: "Позиций в пути", value: fmtNum(o.inTransit) },
        { label: "Поставлено позиций", value: fmtNum(o.delivered) },
        { label: "Запросов ждут ответа", value: fmtNum(waiting.length) },
      ],
      sources: sources.length ? sources : (await documentSources(project.id)).slice(0, 1),
    };
  }

  async function documentsSearch(project: Project, prompt: string): Promise<Draft | null> {
    // Слова названия объекта — это выбор объекта, а не предмет поиска
    const nameStems = projectStems(project);
    const queryWords = words(prompt).filter(
      (word) =>
        word.length >= 3 &&
        !STOP_WORDS.has(word) &&
        !nameStems.some((part) => word.startsWith(part)),
    );
    const terms = queryWords.map(stem);
    const query = queryWords.join(" ");
    const documents = await ports.documents.list({ projectId: project.id });

    // Все действующие позиции объекта страницами по 200 — так же, как их получает экран
    const positions: ExtractedPosition[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await ports.positions.list({
        projectId: project.id,
        limit: 200,
        cursor,
        view: "active",
        order: "position",
      });
      positions.push(...result.items);
      cursor = result.nextCursor;
      if (!cursor || seen.has(cursor)) break;
      seen.add(cursor);
    }

    const found = terms.length
      ? positions.filter((item) => {
          const name = item.projectName.toLowerCase().replace(/ё/g, "е");
          return terms.every((term) => name.includes(term));
        })
      : [];
    const byRevision = new Map(documents.map((item) => [item.document.id, item.document]));
    const unparsed = documents.filter((item) => !item.loaded);

    if (!found.length) {
      return {
        intent: "documents_search",
        projectId: project.id,
        projectName: project.name,
        text: [
          !terms.length
            ? "Уточните, что найти: название материала или изделия, например «кронштейны» или «керамогранит»."
            : !positions.length && unparsed.length
              ? `Позиции документации ${project.name} ещё не разобраны построчно, поэтому искать по ним пока нечего. В реестре документов — ${documents.length} ${plural(documents.length, "документ", "документа", "документов")}.`
              : `В документации ${project.name} не нашёл «${query}». Проверил ${fmtNum(positions.length)} ${plural(positions.length, "позицию", "позиции", "позиций")} в ${documents.length} ${plural(documents.length, "документе", "документах", "документах")}.`,
        ],
        facts: [],
        sources: (await documentSources(project.id)).slice(0, 2),
      };
    }

    const sameUnit = found.every((item) => item.unit === found[0]!.unit);
    const total = found.reduce((sum, item) => sum + item.qty, 0);
    const revisions = [...new Set(found.map((item) => item.documentId))];
    return {
      intent: "documents_search",
      projectId: project.id,
      projectName: project.name,
      text: [
        `В документации ${project.name} нашёл ${found.length} ${plural(found.length, "позицию", "позиции", "позиций")} по запросу «${query}»: ${revisions.map((id) => `«${byRevision.get(id)?.title ?? "документ"}», ${byRevision.get(id)?.version ?? ""}`.trim()).join("; ")}.${sameUnit ? ` Всего ${fmtNum(total, total % 1 ? 3 : 0)} ${found[0]!.unit}.` : ""}`,
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

  async function decisions(project: Project): Promise<Draft | null> {
    const [pending, card, reports] = await Promise.all([
      ports.timeline.pending(project.id),
      ports.projects.card(project.id),
      ports.reports.list(project.id),
    ]);
    const inReview = reports.filter((item) => item.report.status === "review");
    const requests = pending.filter((item) => item.kind === "request");
    const replacements = pending.filter((item) => item.kind === "replacement");
    const unverified = card?.overview.specUnverified ?? 0;

    const lines: string[] = [];
    if (requests.length) {
      lines.push(
        `Ждут решения: ${requests.map((item) => item.title.replace(/^./, (c) => c.toLowerCase())).join("; ")}.`,
      );
    }
    if (replacements.length) {
      lines.push(
        `Предложено ${replacements.length} ${plural(replacements.length, "замена", "замены", "замен")} материалов — обоснование в разделе «Материалы».`,
      );
    }
    if (inReview.length) {
      const first = day(inReview[inReview.length - 1]!.report.sentAt);
      const last = day(inReview[0]!.report.sentAt);
      lines.push(
        `На проверке ${inReview.length} ${plural(inReview.length, "отчёт", "отчёта", "отчётов")} с площадки ${first === last ? `от ${first}` : `— от ${first} до ${last}`}.`,
      );
    }
    if (unverified) {
      lines.push(
        `Без проверки ${fmtNum(unverified)} ${plural(unverified, "позиция", "позиции", "позиций")} спецификации — они не уйдут в запросы поставщикам.`,
      );
    }
    const text = lines.length
      ? [`${project.name}. ${lines[0]}`, ...lines.slice(1)]
      : [`${project.name}: решений, которые ждут вас, сейчас нет.`];

    // Источники подтверждают сказанное: письма по запросам, отчёты на проверке, спецификация
    const sources = dedupe([
      ...(await requestSources(requests.map((item) => item.id))),
      ...(await sourcesOf(inReview.map((item) => item.report.sourceId))),
      ...(unverified || !lines.length ? (await documentSources(project.id)).slice(0, 1) : []),
    ]);
    // Замены без писем и без отчётов: подтверждение — документация объекта, а не пустой ответ
    if (!sources.length) sources.push(...(await documentSources(project.id)).slice(0, 1));
    return {
      intent: "decisions",
      projectId: project.id,
      projectName: project.name,
      text,
      facts: [
        { label: "Выбрать поставщика", value: fmtNum(requests.length) },
        { label: "Замены материалов", value: fmtNum(replacements.length) },
        { label: "Отчётов на проверке", value: fmtNum(inReview.length) },
      ],
      sources: sources.slice(0, 5),
    };
  }

  return {
    ask: async (raw) => {
      const input = askAgentInput.parse(raw);
      const intent = input.intent ?? classifyIntent(input.prompt);
      if (!intent) return null;
      const scope = await pickProject(input.prompt, input.projectId);
      if (!scope) return null;
      const draft =
        intent === "project_summary"
          ? await projectSummary(scope.project)
          : intent === "deliveries"
            ? await deliveries(scope.project)
            : intent === "documents_search"
              ? await documentsSearch(scope.project, input.prompt)
              : await decisions(scope.project);
      // Ответ без первоисточника не отдаётся (ADR-006)
      if (!draft || !draft.sources.length) return null;
      const checked = agentReply.safeParse({ ...draft, scopeNote: scope.scopeNote });
      // Сбой сборки ответа — ошибка сервера, а не неверный запрос: не ZodError, чтобы не стать 400
      if (!checked.success) throw new Error("Ответ ассистента не прошёл проверку схемы");
      return checked.data;
    },
  };
}
