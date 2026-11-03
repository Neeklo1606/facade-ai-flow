/**
 * Прокси HTTP/2 со сжатием gzip перед сервером демо-сборки (ADR-061, решение 16): так файлы
 * отдаёт хостинг — одним каналом и сжатыми. Только для замера `scripts/first-screen.ts`.
 * Запуск: node scripts/h2-proxy.mjs, окружение UPSTREAM, PORT, CERT, KEY.
 */
import http2 from "node:http2";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const upstream = process.env.UPSTREAM ?? "http://localhost:4630";
const server = http2.createSecureServer({
  key: readFileSync(process.env.KEY),
  cert: readFileSync(process.env.CERT),
  allowHTTP1: true,
});

server.on("request", async (req, res) => {
  try {
    const headers = Object.fromEntries(
      Object.entries(req.headers).filter(
        ([k, v]) => !k.startsWith(":") && k !== "accept-encoding" && typeof v === "string",
      ),
    );
    const reply = await fetch(`${upstream}${req.url}`, {
      method: req.method,
      headers,
      redirect: "manual",
      ...(["GET", "HEAD"].includes(req.method) ? {} : { body: req, duplex: "half" }),
    });
    const out = {};
    const hop = [
      "content-length",
      "content-encoding",
      "transfer-encoding",
      "connection",
      "keep-alive",
    ];
    reply.headers.forEach((value, key) => {
      if (!hop.includes(key)) out[key] = value;
    });
    let body = Buffer.from(await reply.arrayBuffer());
    if (/text|javascript|json|css|svg|xml/.test(reply.headers.get("content-type") ?? "")) {
      body = gzipSync(body);
      out["content-encoding"] = "gzip";
    }
    res.writeHead(reply.status, out);
    res.end(body);
  } catch (error) {
    res.writeHead(502);
    res.end(String(error));
  }
});

server.listen(Number(process.env.PORT ?? 4632), () => console.log("h2-proxy готов"));
