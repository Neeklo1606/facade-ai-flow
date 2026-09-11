import { sites } from "@/mock/sites";
import { risks, tasks, documents } from "@/mock/tasks";
import { materials, suppliers, deliveries, requests } from "@/mock/supply";
import { events } from "@/mock/events";
import { allNavItems } from "@/lib/navigation";

/** Сущность, о которой агент знает и на которую умеет ссылаться. */
export interface AgentEntity {
  id: string;
  kind: "Объект" | "Риск" | "Задача" | "Материал" | "Поставщик" | "Поставка" | "Документ" | "Событие" | "Заявка" | "Раздел";
  title: string;
  subtitle?: string;
  to: string;
  tone?: "danger" | "warn" | "ok" | "info";
}

export interface AgentAction {
  label: string;
  to?: string;
  toast?: string;
}

export interface AgentAnswer {
  steps: string[];
  text: string;
  confidence: number;
  entities: AgentEntity[];
  actions: AgentAction[];
  sources: string[];
}

const num = (n: number) => n.toLocaleString("ru-RU");
const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? "Без объекта";

/** Полный индекс сущностей системы — агент «видит» все вкладки. */
export function buildIndex(): AgentEntity[] {
  return [
    ...sites.map<AgentEntity>((s) => ({
      id: s.id,
      kind: "Объект",
      title: s.name,
      subtitle: `Готовность ${s.progress}% · срок ${s.deadline}`,
      to: "/sites",
      tone: s.status === "risk" ? "warn" : "info",
    })),
    ...risks.map<AgentEntity>((r) => ({
      id: r.id,
      kind: "Риск",
      title: r.risk,
      subtitle: `${siteName(r.siteId)} · до ${r.dueDate}`,
      to: "/risks",
      tone: r.severity === "critical" ? "danger" : "warn",
    })),
    ...tasks.map<AgentEntity>((t) => ({
      id: t.id,
      kind: "Задача",
      title: t.title,
      subtitle: `${siteName(t.siteId)} · срок ${t.dueDate}`,
      to: "/tasks",
      tone: t.status === "overdue" ? "danger" : "info",
    })),
    ...materials.map<AgentEntity>((m) => ({
      id: m.id,
      kind: "Материал",
      title: m.name,
      subtitle: `Остаток ${num(m.stock)} ${m.unit} · потребность ${num(m.need)}`,
      to: "/catalogs",
      tone: m.stock === 0 ? "danger" : "info",
    })),
    ...suppliers.map<AgentEntity>((s) => ({
      id: s.id,
      kind: "Поставщик",
      title: s.name,
      subtitle: `Рейтинг ${s.rating} · срок ${s.avgLeadDays} дн.`,
      to: "/suppliers",
      tone: s.rating >= 4.5 ? "ok" : "info",
    })),
    ...deliveries.map<AgentEntity>((d) => ({
      id: d.id,
      kind: "Поставка",
      title: d.items,
      subtitle: `${siteName(d.siteId)} · ожидается ${d.expectedAt}`,
      to: "/deliveries",
      tone: d.status === "rejected" ? "danger" : "info",
    })),
    ...requests.map<AgentEntity>((r) => ({
      id: r.id,
      kind: "Заявка",
      title: `Заявка ${r.id.replace("r-", "З-")}`,
      subtitle: `${siteName(r.siteId)} · ответов: ${r.repliesCount}`,
      to: "/requests",
      tone: r.repliesCount === 0 ? "warn" : "info",
    })),
    ...documents.map<AgentEntity>((d) => ({
      id: d.id,
      kind: "Документ",
      title: d.name,
      subtitle: `${siteName(d.siteId)} · ${d.createdAt}`,
      to: "/documents",
    })),
    ...events.slice(0, 12).map<AgentEntity>((e) => ({
      id: e.id,
      kind: "Событие",
      title: e.preview,
      subtitle: `${e.authorName} · ${e.at.replace("T", " ").slice(0, 16)}`,
      to: "/inbox",
    })),
    ...allNavItems.map<AgentEntity>((n) => ({ id: n.to, kind: "Раздел", title: n.label, to: n.to })),
  ];
}

const INDEX = buildIndex();

export function searchEntities(q: string, limit = 6): AgentEntity[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const words = needle.split(/\s+/).filter((w) => w.length > 2);
  return INDEX.map((e) => {
    const hay = `${e.title} ${e.subtitle ?? ""}`.toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    return { e, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.e);
}

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/** Готовые сценарии по контексту страницы. */
export const suggestionsByRoute: Record<string, string[]> = {
  "/": ["Что горит сегодня?", "Собери сводку для заказчика", "Какие задачи просрочены?"],
  "/risks": ["Разбери критические риски и предложи действия", "Кто отвечает за просроченное?"],
  "/tasks": ["Какие задачи просрочены?", "Создай задачу: закрыть примыкания на захватке 2"],
  "/inbox": ["Что нового с площадки за сутки?", "Что требует проверки?"],
  "/verification": ["Что требует проверки?", "Где низкая уверенность извлечения?"],
  "/requests": ["Чего не хватает на складе?", "Сравни поставщиков по подконструкции"],
  "/suppliers": ["Сравни поставщиков по подконструкции", "У кого лучший срок поставки?"],
  "/deliveries": ["Когда приедут материалы?", "Какие поставки в риске?"],
  "/documents": ["Какие документы не подтверждены?", "Собери пакет по объекту"],
  "/sites": ["Сравни объекты по отставанию", "Что горит сегодня?"],
};

export const defaultSuggestions = [
  "Что горит сегодня?",
  "Чего не хватает на складе?",
  "Какие задачи просрочены?",
  "Собери сводку для заказчика",
];

/** «Выполнение» задачи агентом по данным системы. */
export function runAgent(query: string): AgentAnswer {
  const q = query.toLowerCase();

  if (has(q, "горит", "критич", "срочн", "проблем", "внимани")) {
    const crit = risks.filter((r) => r.severity === "critical");
    return {
      steps: ["Читаю риски и отклонения", "Сверяю с отчётами и остатками", "Формирую приоритеты"],
      text:
        `Критичных пунктов: ${crit.length}. ` +
        crit.map((r) => `«${r.risk}» — ${r.cause}. Действие: ${r.action.toLowerCase()}`).join(". ") +
        ".",
      confidence: 0.93,
      entities: crit.map((r) => ({
        id: r.id,
        kind: "Риск",
        title: r.risk,
        subtitle: `${siteName(r.siteId)} · до ${r.dueDate}`,
        to: "/risks",
        tone: "danger" as const,
      })),
      actions: [
        { label: "Открыть риски", to: "/risks" },
        { label: "Создать задачи по рискам", toast: "Создано 2 задачи из критических рисков" },
      ],
      sources: crit.map((r) => r.sourceLabel ?? "Риски и отклонения"),
    };
  }

  if (has(q, "склад", "остат", "материал", "дефицит", "не хватает", "закуп")) {
    const short = materials.filter((m) => m.stock === 0 || m.delivered < m.need * 0.75);
    return {
      steps: ["Считаю остатки по справочнику", "Сверяю с потребностью и поставками", "Готовлю заявку"],
      text:
        `Позиции под риском: ${short.length}. ` +
        short
          .slice(0, 4)
          .map((m) => `${m.name}: остаток ${num(m.stock)} ${m.unit} при потребности ${num(m.need)}`)
          .join("; ") +
        ".",
      confidence: 0.9,
      entities: short.slice(0, 5).map((m) => ({
        id: m.id,
        kind: "Материал" as const,
        title: m.name,
        subtitle: `Остаток ${num(m.stock)} ${m.unit} · заказано ${num(m.ordered)}`,
        to: "/catalogs",
        tone: m.stock === 0 ? ("danger" as const) : ("warn" as const),
      })),
      actions: [
        { label: "Сформировать заявку", to: "/requests", toast: "Черновик заявки собран по дефицитным позициям" },
        { label: "Открыть поставки", to: "/deliveries" },
      ],
      sources: ["Справочник материалов", "Поставки и заявки"],
    };
  }

  if (has(q, "задач", "просроч", "поручен")) {
    const overdue = tasks.filter((t) => t.status === "overdue");
    const open = tasks.filter((t) => t.status !== "done").length;
    return {
      steps: ["Собираю задачи по объектам", "Проверяю сроки и ответственных"],
      text: `Открытых задач ${open}, из них просрочено ${overdue.length}. ${overdue
        .map((t) => `«${t.title}» — срок ${t.dueDate}`)
        .join("; ")}.`,
      confidence: 0.95,
      entities: overdue.map((t) => ({
        id: t.id,
        kind: "Задача" as const,
        title: t.title,
        subtitle: `${siteName(t.siteId)} · срок ${t.dueDate}`,
        to: "/tasks",
        tone: "danger" as const,
      })),
      actions: [
        { label: "Открыть задачи", to: "/tasks" },
        { label: "Напомнить исполнителям", toast: "Напоминания отправлены в Telegram" },
      ],
      sources: ["Задачи и замечания"],
    };
  }

  if (has(q, "постав", "приед", "срок поставки", "логист", "сравни")) {
    const best = [...suppliers].sort((a, b) => a.avgLeadDays - b.avgLeadDays)[0]!;
    const top = [...suppliers].sort((a, b) => b.rating - a.rating)[0]!;
    return {
      steps: ["Сравниваю поставщиков по сроку и рейтингу", "Проверяю ожидаемые поставки"],
      text: `Быстрее всех «${best.name}» — ${best.avgLeadDays} дн. и ответ за ${best.avgReplyHours} ч. По качеству лидирует «${top.name}» с рейтингом ${top.rating}. Ближайшие поставки: ${deliveries
        .slice(0, 3)
        .map((d) => `${d.items} — ${d.expectedAt}`)
        .join("; ")}.`,
      confidence: 0.87,
      entities: [
        ...suppliers.slice(0, 3).map((s) => ({
          id: s.id,
          kind: "Поставщик" as const,
          title: s.name,
          subtitle: `Рейтинг ${s.rating} · ${s.avgLeadDays} дн.`,
          to: "/suppliers",
          tone: "info" as const,
        })),
        ...deliveries.slice(0, 2).map((d) => ({
          id: d.id,
          kind: "Поставка" as const,
          title: d.items,
          subtitle: `${siteName(d.siteId)} · ${d.expectedAt}`,
          to: "/deliveries",
        })),
      ],
      actions: [
        { label: "Открыть поставщиков", to: "/suppliers" },
        { label: "Запросить цены", to: "/requests", toast: "Запрос цен отправлен 4 поставщикам" },
      ],
      sources: ["Реестр поставщиков", "Поставки"],
    };
  }

  if (has(q, "сводк", "заказчик", "отчёт для", "письмо", "статус проект")) {
    return {
      steps: ["Собираю план-факт по объектам", "Проверяю открытые замечания", "Готовлю письмо"],
      text: `Готова сводка по ${sites.length} объектам. ${sites
        .slice(0, 3)
        .map((s) => `${s.name}: готовность ${s.progress}%, факт ${num(s.areaFact)} из ${num(s.areaPlan)} м²`)
        .join("; ")}. Черновик письма заказчику сформирован и ждёт подтверждения.`,
      confidence: 0.86,
      entities: sites.slice(0, 3).map((s) => ({
        id: s.id,
        kind: "Объект" as const,
        title: s.name,
        subtitle: `Готовность ${s.progress}% · срок ${s.deadline}`,
        to: "/sites",
        tone: s.status === "risk" ? ("warn" as const) : ("info" as const),
      })),
      actions: [
        { label: "Открыть письмо", to: "/documents", toast: "Черновик письма заказчику создан" },
        { label: "Открыть аналитику", to: "/analytics" },
      ],
      sources: ["План-факт по объёмам", "Реестр документов"],
    };
  }

  if (has(q, "создай", "поставь задачу", "напомни", "назначь")) {
    return {
      steps: ["Разбираю формулировку", "Определяю объект и исполнителя", "Создаю задачу"],
      text: `Задача создана: «${query.replace(/^создай задачу:?\s*/i, "")}». Объект определён по контексту, исполнитель — прораб объекта, срок — 3 рабочих дня. Задача ждёт вашего подтверждения.`,
      confidence: 0.79,
      entities: tasks.slice(0, 2).map((t) => ({
        id: t.id,
        kind: "Задача" as const,
        title: t.title,
        subtitle: `${siteName(t.siteId)} · срок ${t.dueDate}`,
        to: "/tasks",
      })),
      actions: [
        { label: "Открыть задачи", to: "/tasks" },
        { label: "Подтвердить и отправить", toast: "Задача отправлена исполнителю в Telegram" },
      ],
      sources: ["Задачи и замечания"],
    };
  }

  if (has(q, "провер", "уверенн", "извлеч", "входящ")) {
    const pending = events.filter((e) => e.status === "review" || e.status === "extracted");
    return {
      steps: ["Смотрю очередь проверки", "Оцениваю уверенность извлечения"],
      text: `На проверке ${pending.length} событий. Приоритет — записи с уверенностью ниже порога 0.75: их поля нельзя принимать без сверки с первоисточником.`,
      confidence: 0.88,
      entities: pending.slice(0, 5).map((e) => ({
        id: e.id,
        kind: "Событие" as const,
        title: e.preview,
        subtitle: `${e.authorName} · ${e.at.replace("T", " ").slice(0, 16)}`,
        to: "/verification",
        tone: "warn" as const,
      })),
      actions: [{ label: "Открыть проверку данных", to: "/verification" }],
      sources: ["Очередь проверки", "Качество извлечения"],
    };
  }

  const found = searchEntities(query);
  if (found.length) {
    return {
      steps: ["Ищу по всем разделам системы", "Сопоставляю сущности"],
      text: `Нашёл ${found.length} совпадений по запросу. Открывайте любую карточку — я перенесу вас в нужный раздел с уже применённым фильтром.`,
      confidence: 0.72,
      entities: found,
      actions: [],
      sources: ["Индекс сущностей системы"],
    };
  }

  return {
    steps: ["Ищу по всем разделам системы"],
    text: "Отвечаю только по подтверждённым данным системы. По этой формулировке точных записей нет — уточните объект, материал или период либо выберите готовый сценарий ниже.",
    confidence: 0.35,
    entities: [],
    actions: [],
    sources: [],
  };
}
