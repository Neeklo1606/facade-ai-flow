/**
 * Хранилище состояния модулей сервиса v1 (ADR-060): две реализации одного интерфейса.
 *
 * - `demoStore` — вкладка браузера (`state.ts`), как в публикуемой демонстрации;
 * - `createGasDbStore` — PostgreSQL по таблицам `src/contracts/gas.ts` (`db-store.ts`).
 *
 * Порты снабжения и документов работают поверх любого из них: правила и права одни и те же,
 * меняется только место хранения. Изменение — функция от свежего снимка, как у `update`:
 * база перечитывает состояние и пишет разницу с проверкой версии.
 */
import type { GasOpsSnapshot } from "@/ports/gas-ops";
import { getSnapshot, update } from "./state";

export interface GasStore {
  read(): Promise<GasOpsSnapshot>;
  /**
   * `base` — снимок, по которому принято решение. База отвергает запись, если с тех пор
   * состояние изменилось (`GasStaleError`), и действие порта повторяется целиком (`retrying`)
   */
  update(
    change: (snapshot: GasOpsSnapshot) => GasOpsSnapshot,
    base?: GasOpsSnapshot,
  ): Promise<GasOpsSnapshot>;
}

export const demoStore: GasStore = {
  read: async () => getSnapshot(),
  update: async (change) => update(change),
};

/** Состояние изменилось между чтением и записью: действие нужно выполнить заново */
export class GasStaleError extends Error {
  constructor() {
    super("Данные изменились в другом окне. Повторите действие.");
    this.name = "GasStaleError";
  }
}

/**
 * Порт, чьи действия повторяются при конфликте версии: заново читают снимок, заново
 * проверяют правила и заново считают номер. Повторов три, затем ошибка уходит человеку
 */
export function retrying<T extends object>(port: T, attempts = 3): T {
  return new Proxy(port, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        for (let attempt = 1; ; attempt += 1) {
          try {
            return await value.apply(target, args);
          } catch (error) {
            if (!(error instanceof GasStaleError) || attempt >= attempts) throw error;
          }
        }
      };
    },
  });
}
