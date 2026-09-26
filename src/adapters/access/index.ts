/**
 * Обёртка прав над портами (ADR-012). Каждый метод каждого порта проходит правило: разделы,
 * нужный уровень и объект вызова. Кто действует — только из сессии: сотрудник, переданный
 * вызывающим, заменяется сотрудником сессии. Одна обёртка на серверные функции и демо-контур.
 */
import { canAny, ownOnly, type AccessSession, type Need, type Section } from "@/domain/access";
import type { EmployeeRole } from "@/contracts";
import { ForbiddenError, type Repositories, type ScopeKind } from "@/ports";

type ProjectRef = { projectId: string } | { kind: ScopeKind; id: string };

interface Rule<A extends unknown[], R> {
  /** Разделы, в любом из которых хватает уровня; session — любой вошедший сотрудник */
  sections: readonly Section[] | "session";
  need: Need;
  /** Объект вызова: по нему проверяется область «свои объекты» */
  project?: (...args: A) => ProjectRef | null;
  /** Список без объекта во входе: для роли со «своими» оставить только её объекты */
  filter?: (result: R, projectIds: string[]) => R;
  /** Справочник без привязки к объекту: доступен и роли со «своими» */
  global?: true;
  /**
   * Право зависит не только от раздела, но и от входа вызова: возвращает причину отказа
   * или null. Первый случай — прораб отмечает только прибытие поставки (ADR-012, дополнение)
   */
  allow?: (role: EmployeeRole, ...args: A) => string | null;
}

type PortRules<P> = {
  [K in keyof P]: P[K] extends (...args: infer A) => Promise<infer R> ? Rule<A, R> : never;
};
export type AccessRules = { [P in keyof Repositories]: PortRules<Repositories[P]> };

const project = (projectId: string): ProjectRef => ({ projectId });
const ref = (kind: ScopeKind, id: string): ProjectRef => ({ kind, id });
const READ = "read" as const;
const WRITE = "write" as const;
const SESSION = { sections: "session", need: READ, global: true } as const;
/** Разделы, где экран показывает позиции: проверка документов и материалы */
const POSITIONS: Section[] = ["documents", "materials"];
/** Справочники материалов и замен: нужны позициям, закупкам и поставкам */
const CATALOGS: Section[] = ["catalogs", "documents", "materials", "procurement", "deliveries"];

export const ACCESS_RULES: AccessRules = {
  clock: { now: SESSION },
  directory: {
    employees: SESSION,
    counterparties: SESSION,
    // Кто заводит сотрудников и раздаёт роли — тот же, кто видит матрицу прав (ADR-021, п. 8)
    saveEmployee: { sections: ["access"], need: WRITE, global: true },
  },
  projects: {
    list: {
      sections: ["projects"],
      need: READ,
      filter: (rows, ids) => rows.filter((row) => ids.includes(row.project.id)),
    },
    exportRegistry: { sections: ["export"], need: READ, global: true },
    card: { sections: ["projects"], need: READ, project: (id) => project(id) },
    create: { sections: ["projects"], need: WRITE, global: true },
    setStatus: {
      sections: ["projects"],
      need: WRITE,
      project: (input) => project(input.projectId),
    },
    completeMilestone: {
      sections: ["projects"],
      need: WRITE,
      project: (input) => project(input.projectId),
    },
    // Захватка — структура объекта, а не справочник: право то же, что у смены статуса (ADR-024)
    saveZone: {
      sections: ["projects"],
      need: WRITE,
      project: (input) => project(input.projectId),
    },
  },
  documents: {
    list: {
      sections: ["documents"],
      need: READ,
      project: (input) => (input.projectId ? project(input.projectId) : null),
      filter: (rows, ids) => rows.filter((row) => ids.includes(row.document.projectId)),
    },
    revisions: { sections: ["documents"], need: READ, project: (id) => ref("document", id) },
    card: { sections: ["documents"], need: READ, project: (id) => ref("revision", id) },
    upload: { sections: ["documents"], need: WRITE, project: (input) => project(input.projectId) },
    changes: { sections: ["documents"], need: READ, project: (input) => project(input.projectId) },
    resolveChange: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => project(input.projectId),
    },
  },
  positions: {
    list: { sections: POSITIONS, need: READ, project: (input) => positionScope(input) },
    facets: { sections: POSITIONS, need: READ, project: (input) => positionScope(input) },
    selection: { sections: POSITIONS, need: READ, project: (input) => positionScope(input) },
    item: { sections: POSITIONS, need: READ, project: (id) => ref("position", id) },
    history: { sections: POSITIONS, need: READ, project: (id) => ref("position", id) },
    confirm: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => (input.ids[0] ? ref("position", input.ids[0]) : null),
    },
    confirmAutoVerified: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => ref("revision", input.revisionId),
    },
    correct: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => ref("position", input.id),
    },
    // Заведение и загрузка спецификации — та же работа с документом, что проверка (ADR-025)
    create: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => ref("revision", input.revisionId),
    },
    importSpec: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => ref("revision", input.revisionId),
    },
    exclude: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => ref("position", input.id),
    },
    markHeader: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => ref("position", input.id),
    },
    reopen: { sections: ["documents"], need: WRITE, project: (input) => ref("position", input.id) },
    undoReview: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => (input.items[0] ? ref("position", input.items[0].id) : null),
    },
    merge: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => ref("position", input.targetId),
    },
    split: { sections: ["documents"], need: WRITE, project: (input) => ref("position", input.id) },
    handOver: {
      sections: ["documents"],
      need: WRITE,
      project: (input) => ref("revision", input.revisionId),
    },
    confirmMatch: {
      sections: ["documents", "materials"],
      need: WRITE,
      project: (input) => ref("position", input.positionId),
    },
    materials: { sections: CATALOGS, need: READ, global: true },
    replacements: { sections: CATALOGS, need: READ, global: true },
  },
  procurement: {
    // Контакты поставщика — раздел «Поставщики»: закупки его не открывают (ADR-012)
    suppliers: { sections: ["suppliers"], need: READ, global: true },
    supplier: { sections: ["suppliers"], need: READ, global: true },
    verifyContact: { sections: ["suppliers"], need: WRITE, global: true },
    templates: { sections: ["procurement"], need: READ, global: true },
    requests: { sections: ["procurement"], need: READ, project: (id) => project(id) },
    request: { sections: ["procurement"], need: READ, project: (id) => ref("request", id) },
    createRequest: {
      sections: ["procurement"],
      need: WRITE,
      project: (input) => project(input.projectId),
    },
    remind: {
      sections: ["procurement"],
      need: WRITE,
      project: (input) => ref("request", input.requestId),
    },
    chooseSupplier: {
      sections: ["procurement"],
      need: WRITE,
      project: (input) => ref("request", input.requestId),
    },
    deliveries: { sections: ["deliveries"], need: READ, project: (id) => project(id) },
    delivery: { sections: ["deliveries"], need: READ, project: (id) => ref("delivery", id) },
    moveDelivery: {
      sections: ["deliveries"],
      need: WRITE,
      project: (input) => ref("delivery", input.deliveryId),
      // Отгрузку и «в пути» подтверждает поставщик через снабжение; на площадке этих фактов нет
      allow: (role, input) =>
        role === "foreman" && input.status !== "arrived"
          ? "прораб отмечает только прибытие поставки"
          : null,
    },
    acceptDelivery: {
      sections: ["deliveries"],
      need: WRITE,
      project: (input) => ref("delivery", input.deliveryId),
    },
    resolveRemark: {
      sections: ["deliveries"],
      need: WRITE,
      project: (input) => ref("remark", input.remarkId),
      // Замечание уходит снабжению — оно же его и закрывает (ADR-011, п. 5)
      allow: (role) => (role === "foreman" ? "замечания по поставке закрывает снабжение" : null),
    },
  },
  reports: {
    list: { sections: ["field-reports"], need: READ, project: (id) => project(id) },
    // Завести отчёт может и прораб: до бота это его единственный способ отчитаться (ADR-022)
    create: {
      sections: ["field-reports"],
      need: WRITE,
      project: (input: { projectId: string }) => project(input.projectId),
    },
    review: {
      sections: ["field-reports"],
      need: WRITE,
      project: (input) => ref("report", input.id),
    },
    // Фрагмент источника открывают из отчётов, закупок, истории и дашборда
    source: {
      sections: ["field-reports", "procurement", "timeline", "dashboard", "documents"],
      need: READ,
      project: (id) => ref("source", id),
    },
  },
  timeline: {
    list: { sections: ["timeline", "dashboard"], need: READ, project: (id) => project(id) },
    decisions: { sections: ["timeline"], need: READ, project: (id) => project(id) },
    pending: { sections: ["timeline", "dashboard"], need: READ, project: (id) => project(id) },
  },
  catalog: {
    categories: { sections: CATALOGS, need: READ, global: true },
    material: { sections: CATALOGS, need: READ, global: true },
    // Журнал справочников видит тот, кто их правит: это проверка его же работы
    catalogChanges: { sections: ["catalogs"], need: READ, global: true },
    saveMaterial: { sections: ["catalogs"], need: WRITE, global: true },
    saveCategory: { sections: ["catalogs"], need: WRITE, global: true },
    // Поставщик — часть подбора в запрос, поэтому право то же, что у раздела поставщиков
    saveSupplier: { sections: ["suppliers"], need: WRITE, global: true },
    importMaterials: { sections: ["catalogs"], need: WRITE, global: true },
  },
  scope: {
    projectsOf: SESSION,
    projectOf: SESSION,
  },
  agent: { ask: { sections: ["agent"], need: READ, global: true } },
};

function positionScope(input: { projectId?: string | undefined; revisionId?: string | undefined }) {
  if (input.projectId) return project(input.projectId);
  if (input.revisionId) return ref("revision", input.revisionId);
  return null;
}

/** Сессия сотрудника: роль из справочника и его объекты. Нет сотрудника — нет сессии */
export async function sessionFor(
  repos: Repositories,
  actorId: string,
): Promise<AccessSession | null> {
  const employee = (await repos.directory.employees()).find((item) => item.id === actorId);
  if (!employee) return null;
  return { actorId, role: employee.role, projectIds: await repos.scope.projectsOf(actorId) };
}

type AnyMethod = (...args: unknown[]) => Promise<unknown>;
type AnyRule = Rule<unknown[], unknown>;

/**
 * Порты с проверкой прав. session() вызывается на каждый вызов метода: в демо персона
 * меняется без перезагрузки, на сервере сессия своя у каждого запроса.
 */
export function guardRepositories(
  inner: Repositories,
  session: () => Promise<AccessSession | null>,
): Repositories {
  const guarded: Record<string, Record<string, AnyMethod>> = {};
  for (const [portName, portRules] of Object.entries(ACCESS_RULES)) {
    const port = inner[portName as keyof Repositories] as unknown as Record<string, AnyMethod>;
    guarded[portName] = {};
    for (const [methodName, rule] of Object.entries(portRules as Record<string, AnyRule>)) {
      const name = `${portName}.${methodName}`;
      guarded[portName][methodName] = async (...args: unknown[]) => {
        const current = await session();
        if (!current) throw new ForbiddenError(`${name}: нет сессии`);
        const scoped = await check(inner, current, rule, args, name);
        // Сотрудник действия — из сессии, что бы ни передал вызывающий
        const call =
          rule.need === "write" ? [...args.slice(0, -1), { actorId: current.actorId }] : args;
        const result = await port[methodName]!(...call);
        return scoped && rule.filter ? rule.filter(result, current.projectIds) : result;
      };
    }
  }
  return guarded as unknown as Repositories;
}

/** Проверка правила; true — роль ограничена своими объектами и результат нужно отфильтровать */
async function check(
  inner: Repositories,
  session: AccessSession,
  rule: AnyRule,
  args: unknown[],
  name: string,
) {
  const denied = (why: string) => new ForbiddenError(`${name}: ${session.role}, ${why}`);
  const why = rule.allow?.(session.role, ...args);
  if (why) throw denied(why);
  if (rule.sections === "session") return false;
  if (!canAny(session.role, rule.sections, rule.need)) throw denied("нет уровня в разделе");
  if (!ownOnly(session.role, rule.sections, rule.need)) return false;

  const target = rule.project?.(...args) ?? null;
  if (!target) {
    if (rule.global || rule.filter) return true;
    throw denied("вызов без объекта у роли со своими объектами");
  }
  const projectId =
    "projectId" in target ? target.projectId : await inner.scope.projectOf(target.kind, target.id);
  if (!projectId || !session.projectIds.includes(projectId)) throw denied("чужой объект");
  return false;
}
