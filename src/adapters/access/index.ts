/**
 * Обёртка прав над портами (ADR-012). Каждый метод каждого порта проходит правило: разделы,
 * нужный уровень и объект вызова. Кто действует — только из сессии: сотрудник, переданный
 * вызывающим, заменяется сотрудником сессии. Одна обёртка на серверные функции и демо-контур.
 */
import { canAny, ownOnly, type AccessSession, type Need, type Section } from "@/domain/access";
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
const CATALOGS: Section[] = ["documents", "materials", "procurement", "deliveries"];

export const ACCESS_RULES: AccessRules = {
  clock: { now: SESSION },
  directory: { employees: SESSION, counterparties: SESSION },
  projects: {
    list: {
      sections: ["projects"],
      need: READ,
      filter: (rows, ids) => rows.filter((row) => ids.includes(row.project.id)),
    },
    exportRegistry: { sections: ["export"], need: READ, global: true },
    card: { sections: ["projects"], need: READ, project: (id) => project(id) },
    create: { sections: ["projects"], need: WRITE, global: true },
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
    materials: { sections: CATALOGS, need: READ, global: true },
    replacements: { sections: CATALOGS, need: READ, global: true },
  },
  procurement: {
    suppliers: { sections: ["suppliers", "procurement"], need: READ, global: true },
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
    },
  },
  reports: {
    list: { sections: ["field-reports"], need: READ, project: (id) => project(id) },
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
  if (rule.sections === "session") return false;
  const denied = (why: string) => new ForbiddenError(`${name}: ${session.role}, ${why}`);
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
