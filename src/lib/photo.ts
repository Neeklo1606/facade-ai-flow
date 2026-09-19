/**
 * Фото приёмки (ADR-011, п. 4): уменьшаем в браузере до 1280 px по длинной стороне и сжимаем
 * в JPEG до ~120 КБ. Иначе шесть снимков с телефона не поместились бы в состояние вкладки.
 */
const MAX_SIDE = 1280;
const TARGET_BYTES = 120_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Файл не открывается как изображение"));
    };
    image.src = url;
  });
}

/** data URL JPEG; длина base64 примерно на треть больше байтов */
export async function compressPhoto(file: File): Promise<string> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не умеет уменьшать изображения");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.72;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length * 0.75 > TARGET_BYTES && quality > 0.35) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}
