import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ACCESS,
  MATRIX_ROLES,
  SECTIONS,
  can as canRole,
  canOpenProject,
  rolesWith,
  sectionLabel,
  sectionOfPath,
  sectionShortLabel,
  projectOfPath,
  type Need,
  type Section,
} from "@/domain/access";
import { FORBIDDEN_MESSAGE } from "@/ports";
import { useCurrentUser } from "@/lib/project-scope";
import { queries } from "./queries";

/**
 * Права для экранов (ADR-012): та же матрица, что проверяет обёртка портов. Экран не решает
 * сам, что можно роли, — он спрашивает здесь и не рисует недоступное.
 */
export {
  ACCESS,
  MATRIX_ROLES,
  SECTIONS,
  rolesWith,
  sectionLabel,
  sectionOfPath,
  sectionShortLabel,
  projectOfPath,
  type Need,
  type Section,
};

/** Отказ в правах от адаптера или сервера: текст один на все отказы */
export function isForbidden(error: unknown) {
  return error instanceof Error && error.message === FORBIDDEN_MESSAGE;
}

/**
 * Права текущей персоны. ready — роль известна: до этого экран не решает, показывать ли раздел,
 * иначе у прораба на мгновение мелькнул бы экран руководителя.
 */
export function useAccess() {
  const user = useCurrentUser();
  const role = user?.role ?? null;
  const session = useQuery({ ...queries.session(user?.id ?? ""), enabled: !!user });
  const can = useCallback(
    (section: Section, need: Need = "read") => !!role && canRole(role, section, need),
    [role],
  );
  const canProject = useCallback(
    (section: Section, projectId: string, need: Need = "read") =>
      !!session.data && canOpenProject(session.data, [section], projectId, need),
    [session.data],
  );
  /**
   * Можно ли открыть адрес: раздел по адресу доступен роли, а объект — если роль ограничена
   * своими объектами. Ссылки в закрытые разделы экраны не рисуют (ADR-012, п. 6).
   */
  const canOpen = useCallback(
    (href: string) => {
      if (!role) return false;
      const url = new URL(href, "http://local");
      const section = sectionOfPath(url.pathname, url.searchParams.get("view") ?? undefined);
      if (!section) return true;
      if (!canRole(role, section)) return false;
      const projectId = projectOfPath(url.pathname);
      return !projectId || !session.data || canOpenProject(session.data, [section], projectId);
    },
    [role, session.data],
  );
  return { ready: !!role, role, can, canProject, canOpen, session: session.data ?? null };
}

/** Короткая форма для кнопок: может ли роль менять данные раздела */
export function useCanWrite(section: Section) {
  return useAccess().can(section, "write");
}
