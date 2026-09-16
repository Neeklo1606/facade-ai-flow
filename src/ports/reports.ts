import { z } from "zod";
import {
  evidence,
  extractions,
  fieldReport,
  reportStatus,
  sources,
  type Evidence,
  type Extraction,
  type FieldReport,
  type Source,
} from "@/contracts";
import type { Actor } from "./common";

export const listReportsInput = z.object({
  projectId: z.string().min(1),
  status: reportStatus.schema.optional(),
  zoneId: z.string().optional(),
});

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
  evidence: z.array(evidence),
  source: sources,
  extractions: z.array(extractions),
});

export type ListReportsInput = z.infer<typeof listReportsInput>;
export type ReviewReportInput = z.infer<typeof reviewReportInput>;

export interface ReportCard {
  report: FieldReport;
  evidence: Evidence[];
  source: Source;
  extractions: Extraction[];
}

/** Отчёты с площадки и первоисточники. */
export interface ReportsPort {
  list(input: ListReportsInput): Promise<FieldReport[]>;
  card(reportId: string): Promise<ReportCard | null>;
  /** Приёмка или возврат; принятый объём попадает в факт захватки */
  review(input: ReviewReportInput, actor: Actor): Promise<FieldReport>;
  /** Источник с распознанными полями — для панели «Источник» */
  source(sourceId: string): Promise<{ source: Source; extractions: Extraction[] } | null>;
}
