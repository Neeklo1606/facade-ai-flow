import { afterEach, describe, expect, spyOn, test } from "bun:test";
import server from "@/server";
import { clientErrorResponse } from "@/api/client-error-log";
import { grantResponse } from "@/lib/access";
import { SECRET_PARAMS, withoutSecretParams } from "@/lib/secret-params";
import { requestIsHttps, securityHeaders } from "@/lib/security-headers";

/**
 * Заголовки безопасности, куки за прокси и секреты в адресе (план критического тестирования,
 * раздел 2): ссылка входа и ключ личной ссылки не уходят в журнал и в Referer.
 */

afterEach(() => {
  delete process.env["CLIENT_LINK_KEY"];
});

describe("секреты адреса не попадают в журнал", () => {
  test("ключ показа, приглашение и личная ссылка заказчика маскируются, остальное на месте", () => {
    expect(withoutSecretParams("/login?invite=abcdef0123456789&to=%2Fgas")).toBe(
      "/login?invite=%D1%81%D0%BA%D1%80%D1%8B%D1%82%D0%BE&to=%2Fgas",
    );
    for (const name of SECRET_PARAMS) {
      const masked = withoutSecretParams(`https://h.example/gas?${name}=SECRET123#top`);
      expect(masked).not.toContain("SECRET123");
      expect(masked.endsWith("#top")).toBe(true);
    }
    expect(withoutSecretParams("/gas/week?tab=2")).toBe("/gas/week?tab=2");
    expect(withoutSecretParams("/gas")).toBe("/gas");
  });

  test("приём ошибок фронтенда маскирует секрет, даже если браузер прислал его", async () => {
    const lines: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      const response = await clientErrorResponse(
        new Request("http://localhost/api/client-error", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "Падение экрана",
            url: "/login?invite=TOKEN-SHOULD-NOT-LEAK&c=CLIENT-KEY-LEAK",
            userAgent: "test",
            at: "2026-11-23T00:00:00Z",
          }),
        }),
      );
      expect(response.status).toBe(204);
    } finally {
      spy.mockRestore();
    }
    const log = lines.join("\n");
    expect(log).toContain("Падение экрана");
    expect(log).not.toContain("TOKEN-SHOULD-NOT-LEAK");
    expect(log).not.toContain("CLIENT-KEY-LEAK");
  });

  test("личная ссылка заказчика: ответ уводит на адрес без ключа", async () => {
    process.env["CLIENT_LINK_KEY"] = "client-key-for-test";
    const response = await server.fetch(
      new Request("http://localhost/gas/week?c=client-key-for-test&tab=1"),
      {},
      {},
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/gas/week?tab=1");
    expect(response.headers.get("location")).not.toContain("client-key");
  });
});

describe("заголовки безопасности", () => {
  test("у каждого ответа сервера: nosniff, политика Referer, разрешения", async () => {
    const response = await server.fetch(new Request("http://localhost/gas?c=wrong"), {}, {});
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
    expect(response.headers.get("permissions-policy")).toContain("payment=()");
  });

  test("экран входа не передаёт адрес никому: в нём ссылка-приглашение", () => {
    const login = new Map(securityHeaders({ pathname: "/login", working: true }));
    expect(login.get("referrer-policy")).toBe("no-referrer");
  });

  test("рабочий контур не встраивается в чужие окна, демонстрация встраивается редактором", () => {
    const working = new Map(securityHeaders({ pathname: "/gas", working: true }));
    expect(working.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(working.get("content-security-policy")).toBe("frame-ancestors 'self'");
    const demo = new Map(securityHeaders({ pathname: "/gas", working: false }));
    expect(demo.has("x-frame-options")).toBe(false);
  });
});

describe("куки за обратным прокси", () => {
  test("https определяется и по x-forwarded-proto: кука выходит с Secure", () => {
    const behindCaddy = new Request("http://app:3000/gas", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(requestIsHttps(behindCaddy)).toBe(true);
    expect(requestIsHttps(new Request("http://localhost:3000/gas"))).toBe(false);
    const cookie = grantResponse(new URL("http://app:3000/gas?k=x"), "x", true).headers.get(
      "set-cookie",
    );
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
  });

  test("личная ссылка заказчика за прокси ставит куку с Secure и HttpOnly", async () => {
    process.env["CLIENT_LINK_KEY"] = "client-key-for-test";
    const response = await server.fetch(
      new Request("http://app:3000/gas?c=client-key-for-test", {
        headers: { "x-forwarded-proto": "https" },
      }),
      {},
      {},
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("client-key-for-test");
  });
});
