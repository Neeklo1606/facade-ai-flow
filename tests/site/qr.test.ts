import { describe, expect, test } from "bun:test";
import jsQR from "jsqr";
import { cleanPartnerCode, partnerLink } from "@/lib/site/partner";
import { qrMatrix } from "@/lib/site/qr";

/** QR набора партнёра (ADR-051): код декодируется обратно в ту же ссылку */
function decode(text: string): string | null {
  const matrix = qrMatrix(text);
  const quiet = 4;
  const scale = 6;
  const size = (matrix.length + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((line, row) =>
    line.forEach((dark, col) => {
      if (!dark) return;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const offset = (((row + quiet) * scale + y) * size + (col + quiet) * scale + x) * 4;
          data[offset] = data[offset + 1] = data[offset + 2] = 0;
        }
      }
    }),
  );
  return jsQR(data, size, size)?.data ?? null;
}

describe("QR и ссылки партнёра", () => {
  test("ссылка с кодом партнёра декодируется из QR без изменений", () => {
    for (const path of ["/", "/demo", "/case/gas", "/razbor"]) {
      const link = partnerLink("https://gaika.example", path, "vasya-01");
      expect(link).toContain("src=vasya-01");
      expect(decode(link)).toBe(link);
    }
  });

  test("без кода ссылка чистая", () => {
    expect(partnerLink("https://gaika.example", "/demo", "")).toBe("https://gaika.example/demo");
  });

  test("код партнёра очищается от лишних знаков", () => {
    expect(cleanPartnerCode(" Вася<script>-1 ")).toBe("script-1");
    expect(cleanPartnerCode("x".repeat(60))).toHaveLength(40);
  });
});
