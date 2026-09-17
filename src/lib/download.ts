/** Сохранить файл, полученный из слоя данных (выгрузка Excel) */
export function saveFile(file: Blob, fileName: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari начинает скачивание асинхронно: ссылку на файл освобождаем чуть позже, а не сразу
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
