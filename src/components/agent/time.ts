/** Время сообщения по часам устройства: «09:41» */
export const clockTime = (date: Date) =>
  date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
