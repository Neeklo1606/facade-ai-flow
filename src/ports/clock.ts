import { z } from "zod";
import { timestampSchema } from "@/contracts";

export const clockNow = timestampSchema;

/**
 * Текущее время источника данных в формате дат контрактов. Сроки («просрочено», «сегодня»)
 * экраны считают от него: в демо это часы демо, в рабочем режиме — время сервера.
 */
export interface ClockPort {
  now(): Promise<string>;
}
