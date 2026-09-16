import { useQuery } from "@tanstack/react-query";
import { queries } from "./queries";

/**
 * Текущее время источника данных для сроков на экране («просрочено», «сегодня»).
 * В демо это часы демо, в рабочем режиме — время сервера. Корневой loader загружает его заранее;
 * пока ответа нет (ошибка сети), считаем от времени устройства.
 */
export function useNow() {
  return useQuery(queries.now()).data ?? localNow();
}

function localNow() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}
