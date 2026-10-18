import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { materialRequests } from "@/contracts";
import {
  createMaterialRequestInput,
  decideMaterialRequestInput,
  materialRequestList,
  shiftInput,
} from "@/ports";
import { input, respond } from "./errors";
import { requestRepositories, serverActor } from "./server-repositories";

/**
 * Заявки на материал и сводка смены на сервере (ADR-037). В демонстрации те же порты зовёт
 * адаптер во вкладке — поведение одно, контур разный.
 */

const projectFilter = z.object({ projectId: z.string().min(1).nullable() });

export const requestsFn = createServerFn({ method: "GET" })
  .validator(input(projectFilter))
  .handler(async ({ data }) =>
    respond(materialRequestList, await requestRepositories().supply.requests(data.projectId)),
  );

export const createRequestFn = createServerFn({ method: "POST" })
  .validator(input(createMaterialRequestInput))
  .handler(async ({ data }) =>
    respond(
      materialRequests,
      await requestRepositories().supply.createRequest(data, serverActor()),
    ),
  );

export const decideRequestFn = createServerFn({ method: "POST" })
  .validator(input(decideMaterialRequestInput))
  .handler(async ({ data }) =>
    respond(
      materialRequests,
      await requestRepositories().supply.decideRequest(data, serverActor()),
    ),
  );

const shiftSummarySchema = z.object({
  projectName: z.string(),
  date: z.string(),
  rows: z.array(
    z.object({
      reportId: z.string(),
      zoneName: z.string(),
      workType: z.string(),
      qty: z.number(),
      unit: z.string(),
      people: z.number(),
      sourceTitle: z.string(),
      sourceLocation: z.string(),
      mediaCount: z.number(),
    }),
  ),
  totals: z.array(z.object({ unit: z.string(), qty: z.number() })),
  people: z.number(),
  pending: z.number(),
});

export const shiftFn = createServerFn({ method: "GET" })
  .validator(input(shiftInput))
  .handler(async ({ data }) =>
    respond(shiftSummarySchema, await requestRepositories().reports.shift(data)),
  );
