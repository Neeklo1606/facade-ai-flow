import type {
  OfferLine,
  RequestLine,
  Source,
  SupplierOffer,
  SupplierProfile,
  SupplyRequest,
} from "@/contracts";

/**
 * Демо-симулятор ответов поставщиков. Реального почтового ящика нет, поэтому предложение
 * собирается по запросу: цена от справочной для семейства материала, разброс по поставщику,
 * иногда — неполный объём или отклонение от спецификации, как в настоящих ответах.
 */

/** Справочная цена за единицу без НДС, ₽. Ключ — семейство материала. В предложение уходит в копейках. */
const basePrice: Record<string, number> = {
  bracket: 268,
  rail: 405,
  tile: 1695,
  wool: 410,
  membrane: 96,
  anchor: 38,
  rivet: 2.4,
  parapet: 1180,
  strip: 305,
  firecut: 510,
};

const specDeviation: Record<string, string> = {
  bracket: "Толщина 1,8 мм, по спецификации 2 мм — нужен расчёт на ветровую нагрузку",
  rail: "Сплав АД31 Т5 вместо Т1 — меньше предел текучести",
  tile: "Толщина 9 мм, по спецификации 10 мм",
  wool: "Плотность 80 кг/м³, по спецификации 90 кг/м³",
  membrane: "Горючесть Г2, по спецификации Г1",
  anchor: "Анкер 10×90 вместо 10×100",
  parapet: "Цвет RAL 7024 вместо RAL 7016",
  strip: "Нащельник 45×45 вместо 50×50",
  firecut: "Сталь 0,5 мм вместо 0,55 мм",
};

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Детерминированный генератор: один и тот же запрос и поставщик дают одно и то же предложение. */
function rng(seed: string) {
  let x = hash(seed) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10_000) / 10_000;
  };
}

/** Цена в копейках: дешёвый крепёж — с копейками, остальное — до рубля */
function priceKopecks(rubles: number) {
  return rubles < 10 ? Math.round(rubles * 100) : Math.round(rubles) * 100;
}

const rub = (kopecks: number) => (kopecks / 100).toLocaleString("ru-RU");

export interface SimulatedReply {
  offer: SupplierOffer;
  lines: OfferLine[];
  source: Source;
}

export function simulateReply(
  request: SupplyRequest,
  profile: SupplierProfile,
  supplierName: string,
  receivedAt: string,
  familyOf: (line: RequestLine) => string,
): SimulatedReply {
  const random = rng(`${request.id}:${profile.supplierId}`);
  const factor = 0.93 + random() * 0.15;
  const offerId = `so-live-${request.id}-${profile.supplierId}`;
  const sourceId = `src-live-${request.id}-${profile.supplierId}`;
  const leadBase = 7 + Math.floor(random() * 14);

  const lines: OfferLine[] = request.items.map((item, index) => {
    const family = familyOf(item);
    const price = priceKopecks((basePrice[family] ?? 500) * factor * (0.97 + random() * 0.06));
    const shortage = random() < 0.2;
    const availableQty = shortage ? Math.floor(item.qty * (0.6 + random() * 0.3)) : item.qty;
    const deviation = shortage
      ? `Доступно ${availableQty.toLocaleString("ru-RU")} из ${item.qty.toLocaleString("ru-RU")} ${item.unit}, остаток через ${5 + Math.floor(random() * 10)} дней`
      : random() < 0.15
        ? (specDeviation[family] ?? "Аналог другого производителя, паспорт приложен")
        : null;
    return {
      id: `${offerId}-${index + 1}`,
      offerId,
      requestLineId: item.id,
      name: item.name,
      price,
      availableQty,
      leadTimeDays: leadBase + Math.floor(random() * 4),
      deviation,
      sourceId,
      location: `таблица 1, строка ${index + 1}`,
    };
  });

  const deliveryCost = (8_000 + Math.floor(random() * 30) * 1_000) * 100;
  const excerpt = [
    ...lines.slice(0, 3).map((line) => `${line.name} — ${rub(line.price)} руб. без НДС`),
    lines.length > 3 ? `…и ещё ${lines.length - 3} поз. в таблице` : null,
    `Доставка на объект ${rub(deliveryCost)} руб. Отгрузка ${leadBase} рабочих дней.`,
  ]
    .filter(Boolean)
    .join(". ");

  return {
    offer: {
      id: offerId,
      requestId: request.id,
      supplierId: profile.supplierId,
      receivedAt,
      deliveryCost,
      vatPct: 20,
      validUntil: new Date(new Date(receivedAt).getTime() + 10 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      confidence: 0.86 + random() * 0.1,
      sourceId,
    },
    lines,
    source: {
      id: sourceId,
      kind: "email",
      title: `Коммерческое предложение «${supplierName}» по запросу ${request.number}`,
      author: profile.email,
      receivedAt,
      projectId: request.projectId,
      location: "таблица 1",
      excerpt,
    },
  };
}
