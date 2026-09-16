import { z } from "zod";
import {
  evidence,
  extractions,
  fieldReport,
  projectDecision,
  sources,
  type Evidence,
  type Extraction,
  type FieldReport,
  type ProjectDecision,
  type Source,
} from "@/contracts";
import type { Actor } from "./common";

export const reviewReportInput = z
  .object({
    id: z.string().min(1),
    status: z.enum(["accepted", "returned"]),
    acceptedQty: z.number().nonnegative().nullable(),
  })
  .refine((input) => (input.status === "accepted") === (input.acceptedQty !== null), {
    message: "Принятый объём указывается только при приёмке",
    path: ["acceptedQty"],
  });

export const reportCard = z.object({
  report: fieldReport,
  /** Первоисточник отчёта: расшифровка голосового сообщения или текст */
  source: sources.nullable(),
  evidence: z.array(evidence),
  extractions: z.array(extractions),
});

export const sourceCard = z.object({
  source: sources,
  extractions: z.array(extractions),
  /** Решения, принятые на основании источника */
  decisions: z.array(projectDecision),
});

export type ReviewReportInput = z.infer<typeof reviewReportInput>;

export interface ReportCard {
  report: FieldReport;
  source: Source | null;
  evidence: Evidence[];
  extractions: Extraction[];
}

export interface SourceCard {
  source: Source;
  extractions: Extraction[];
  decisions: ProjectDecision[];
}

/** Отчёты с площадки и первоисточники. */
export interface ReportsPort {
  /** Отчёты объекта с материалами и распознанными полями, новые сверху */
  list(projectId: string): Promise<ReportCard[]>;
  /** Приёмка или возврат на уточнение */
  review(input: ReviewReportInput, actor: Actor): Promise<void>;
  source(sourceId: string): Promise<SourceCard | null>;
}
