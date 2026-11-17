import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FolderCard } from "@/components/gas-ops/estimates/FolderCard";
import { estimateFolderServer } from "@/adapters/gas-ops/estimate-folder-server";

test("ошибка папки оставляет причину и повтор загрузки без вымышленных файлов", () => {
  const html = renderToStaticMarkup(
    createElement(FolderCard, {
      status: null,
      rows: [],
      summary: "",
      error: "Сервер не ответил: нет связи",
      loading: false,
      busy: false,
      pending: 0,
      canFetch: true,
      onRefresh: () => {},
      onFetch: async () => [],
    }),
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain("Сервер не ответил: нет связи");
  expect(html).toContain('aria-label="Обновить список папки"');
  expect(html).not.toContain('disabled=""');
  expect(html).not.toContain("Демо:");
  expect(html).not.toContain('data-testid="estimate-folder-file"');
});

test("после отказа сервера повторный запрос возвращает настоящий список", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1
      ? Response.json({ reason: "Сервис временно недоступен" }, { status: 503 })
      : Response.json({
          ok: true,
          status: { connected: true, demo: false, folder: "disk:/Сметы" },
          files: [],
        });
  }) as unknown as typeof fetch;
  try {
    const failed = await estimateFolderServer.list();
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.reason).toBe("Сервис временно недоступен");
    expect(await estimateFolderServer.list()).toMatchObject({
      ok: true,
      files: [],
      status: { connected: true },
    });
    expect(calls).toBe(2);
  } finally {
    globalThis.fetch = original;
  }
});
