import qrcode from "qrcode-generator";

/**
 * QR-код на клиенте без внешних сервисов (ADR-051): матрица модулей из `qrcode-generator`,
 * рисуем сами. Уровень коррекции M, версия подбирается по длине ссылки.
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => qr.isDark(row, col)),
  );
}

/** Рисует код в canvas с полем в 4 модуля; цвета чёрный по белому, чтобы читал любой сканер */
export function drawQr(canvas: HTMLCanvasElement, text: string, pixels = 512) {
  const matrix = qrMatrix(text);
  const quiet = 4;
  const modules = matrix.length + quiet * 2;
  const scale = Math.max(1, Math.floor(pixels / modules));
  canvas.width = canvas.height = modules * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  matrix.forEach((line, row) =>
    line.forEach((dark, col) => {
      if (dark) ctx.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
    }),
  );
}
