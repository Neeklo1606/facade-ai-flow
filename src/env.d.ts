/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Источник данных (ADR-004): demo — адаптер во вкладке, server — серверные функции */
  readonly VITE_DATA_SOURCE?: "demo" | "server";
  /** Запасной способ задать ключ доступа, когда хостинг умеет только переменные сборки (TASK-A5) */
  readonly VITE_DEMO_ACCESS_KEY?: string;
  /** Публичный адрес для og-тегов, если демонстрация переедет с адреса Lovable */
  readonly VITE_PUBLIC_URL?: string;
  /** Куда ведёт «Обсудить пилот» на финале показа; пусто — кнопки нет (ADR-038) */
  readonly VITE_CONTACT_URL?: string;
  /** Переключатель состояний экрана для проверки макетов */
  readonly VITE_SCREEN_STATES?: string;
  /** Газовый контур без снабжения, ПТО и общего лендинга (ADR-061); "0" возвращает модули */
  readonly VITE_GAS_ONLY?: string;
  readonly VITE_GAS_SPLIT_TIME?: string;
  /** Режим кабинета заказчика (ADR-062, F6): "1" — только /gas, без демо-меток и показа */
  readonly VITE_CABINET_ONLY?: string;
  /** Название заказчика для заголовка вкладки кабинета: в коде его нет */
  readonly VITE_CABINET_CLIENT?: string;
}
