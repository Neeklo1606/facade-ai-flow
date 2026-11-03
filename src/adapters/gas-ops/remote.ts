/**
 * Порт учёта времени через сервер (ADR-061, 14): `VITE_DATA_SOURCE=server`. Каждый метод —
 * вызов серверной функции; отказ правил приходит с тем же кодом, что во вкладке, и экран
 * показывает его так же. После действия снимок перечитывается: экраны берут его из той же
 * вкладки, что в демо, и не знают, откуда он пришёл.
 */
import { GasOpsError, type GasOpsPort, type GasOpsSnapshot } from "@/ports/gas-ops";

export type GasRemoteResult =
  { ok: true; value: unknown } | { ok: false; status: number; code: string; message: string };

export type GasRemoteCall = (method: string, args: unknown[]) => Promise<GasRemoteResult>;

/** Методы чтения: после них снимок не перечитывается */
const READS = new Set(["snapshot", "fieldSnapshot", "finalCheck"]);

export function createGasOpsRemote(
  /** Имена методов порта: объект собирается по списку, без Proxy, чтобы `then` не появился */
  methods: readonly string[],
  call: GasRemoteCall,
  onSnapshot: (snapshot: GasOpsSnapshot) => void,
): GasOpsPort {
  const run = async (method: string, args: unknown[]) => {
    const result = await call(method, args);
    if (!result.ok) {
      throw new GasOpsError(result.code as GasOpsError["code"], result.message);
    }
    if (method === "snapshot") onSnapshot(result.value as GasOpsSnapshot);
    else if (!READS.has(method)) {
      const fresh = await call("snapshot", []);
      if (fresh.ok) onSnapshot(fresh.value as GasOpsSnapshot);
    }
    return result.value;
  };
  return Object.fromEntries(
    methods.map((method) => [method, (...args: unknown[]) => run(method, args)]),
  ) as unknown as GasOpsPort;
}
