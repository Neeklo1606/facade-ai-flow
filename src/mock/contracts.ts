/** Договоры и извлеченные агентом условия. Синтетические данные, парсинг — демо-имитация. */
import type { Confidence } from "@/components/common/ConfidenceIndicator";

export type ContractStatus = "uploaded" | "recognizing" | "ready" | "review";

export const contractStatusLabels: Record<ContractStatus, string> = {
  uploaded: "Загружен",
  recognizing: "Распознается",
  ready: "Готов",
  review: "Требует проверки",
};

export interface ContractBlock {
  id: string;
  clause?: string;
  text: string;
}

export interface ContractPage {
  page: number;
  title: string;
  blocks: ContractBlock[];
}

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence: Confidence;
  page: number;
  quoteId: string;
  clause: string;
}

export interface ContractMilestone {
  id: string;
  title: string;
  date: string;
  clause: string;
  taskTitle: string;
}

export interface ContractDoc {
  id: string;
  docId: string;
  projectId: string;
  customer: string;
  number: string;
  date: string;
  sum: number;
  status: ContractStatus;
  agent: string;
  parsedAt: string;
  tasksCreated: number;
  pages: ContractPage[];
  fields: ExtractedField[];
  milestones: ContractMilestone[];
}

const skPages: ContractPage[] = [
  {
    page: 1,
    title: "Договор подряда СИ-2025/114-НВФ. Стороны и предмет",
    blocks: [
      {
        id: "sk-p1-parties",
        clause: "преамбула",
        text: "ООО «ГК Стройинвест», именуемое в дальнейшем «Заказчик», в лице генерального директора Пантелеева А.В., и ООО СК «Фасадные системы», именуемое «Подрядчик», в лице директора Соколовой Т.М., заключили настоящий договор о нижеследующем.",
      },
      {
        id: "sk-p1-subject",
        clause: "п. 1.1",
        text: "Подрядчик обязуется выполнить работы по устройству навесного вентилируемого фасада корпуса 3 ЖК «Северная Корона» общей площадью 12 400 м², включая поставку подсистемы, утеплителя, мембраны и облицовки керамогранитом 600х600.",
      },
      {
        id: "sk-p1-scope",
        clause: "п. 1.4",
        text: "Работы выполняются в соответствии с проектной документацией шифра АР-114-Ф и утвержденной ведомостью объемов работ (Приложение №1).",
      },
    ],
  },
  {
    page: 2,
    title: "Цена договора и порядок расчетов",
    blocks: [
      {
        id: "sk-p2-sum",
        clause: "п. 2.1",
        text: "Общая стоимость работ составляет 78 400 000 (семьдесят восемь миллионов четыреста тысяч) рублей, включая НДС 20%. Цена является твердой и изменению не подлежит, за исключением случаев, предусмотренных п. 2.6.",
      },
      {
        id: "sk-p2-advance",
        clause: "п. 2.3",
        text: "Заказчик перечисляет аванс в размере 20% от цены договора — 15 680 000 рублей — в течение 10 (десяти) банковских дней с даты подписания договора.",
      },
      {
        id: "sk-p2-retention",
        clause: "п. 2.5",
        text: "Гарантийное удержание составляет 5% от стоимости каждого этапа и возвращается по истечении 12 месяцев с даты подписания итогового акта.",
      },
    ],
  },
  {
    page: 3,
    title: "Сроки выполнения работ и этапы",
    blocks: [
      {
        id: "sk-p3-terms",
        clause: "п. 3.1",
        text: "Начало работ — 02.03.2026, окончание всех работ и сдача объекта — не позднее 28.11.2026.",
      },
      {
        id: "sk-p3-stages",
        clause: "п. 3.2",
        text: "Этапы: подготовка и замеры — до 06.04.2026; монтаж подсистемы — до 21.08.2026; утеплитель и мембрана — до 11.09.2026; облицовка — до 23.10.2026; примыкания и сдача — до 28.11.2026.",
      },
      {
        id: "sk-p3-checkpoints",
        clause: "п. 3.4",
        text: "Подрядчик передает исполнительную документацию по каждому закрытому этажу в течение 5 рабочих дней после завершения монтажа на этаже. Контрольная точка по 5-8 этажам — 11.08.2026.",
      },
    ],
  },
  {
    page: 4,
    title: "Ответственность сторон",
    blocks: [
      {
        id: "sk-p4-penalty",
        clause: "п. 5.2",
        text: "За нарушение промежуточных сроков Подрядчик уплачивает пени в размере 0,1% от стоимости просроченного этапа за каждый день просрочки, но не более 5% стоимости этапа.",
      },
      {
        id: "sk-p4-fine",
        clause: "п. 5.4",
        text: "За нарушение требований к качеству, выявленное при приемке, начисляется штраф 150 000 рублей за каждый подтвержденный случай.",
      },
    ],
  },
  {
    page: 5,
    title: "Приемка работ и гарантия",
    blocks: [
      {
        id: "sk-p5-acceptance",
        clause: "п. 6.1",
        text: "Приемка выполненных работ производится ежемесячно по формам КС-2 и КС-3. Заказчик рассматривает документы в течение 7 рабочих дней и подписывает акт либо направляет мотивированный отказ.",
      },
      {
        id: "sk-p5-warranty",
        clause: "п. 7.1",
        text: "Гарантийный срок на выполненные работы и смонтированные конструкции — 60 месяцев с даты подписания итогового акта приемки.",
      },
      {
        id: "sk-p5-hidden",
        clause: "п. 6.4",
        text: "Скрытые работы предъявляются к освидетельствованию до их закрытия последующими конструкциями, с уведомлением Заказчика не менее чем за 2 рабочих дня.",
      },
    ],
  },
];

const mrPages: ContractPage[] = [
  {
    page: 1,
    title: "Договор подряда ПС-2025/067-СПК. Стороны и предмет",
    blocks: [
      {
        id: "mr-p1-parties",
        clause: "преамбула",
        text: "АО «ПромСтрой Капитал» («Заказчик») и ООО СК «Фасадные системы» («Подрядчик») заключили договор на устройство светопрозрачных конструкций БЦ «Меридиан».",
      },
      {
        id: "mr-p1-subject",
        clause: "п. 1.1",
        text: "Предмет: изготовление и монтаж стоечно-ригельного витража площадью 8 900 м², включая узлы примыкания к кровле и входным группам.",
      },
    ],
  },
  {
    page: 2,
    title: "Цена и расчеты",
    blocks: [
      {
        id: "mr-p2-sum",
        clause: "п. 2.1",
        text: "Стоимость работ — 95 200 000 рублей с учетом НДС 20%.",
      },
      {
        id: "mr-p2-advance",
        clause: "п. 2.2",
        text: "Аванс 30% выплачивается двумя траншами: 15% при подписании, 15% после поставки профиля на объект.",
      },
    ],
  },
  {
    page: 3,
    title: "Сроки и этапы",
    blocks: [
      {
        id: "mr-p3-terms",
        clause: "п. 3.1",
        text: "Срок выполнения работ: с 19.01.2026 по 30.12.2026 включительно.",
      },
      {
        id: "mr-p3-stages",
        clause: "п. 3.3",
        text: "Промежуточные сроки: поставка профиля — 15.04.2026; монтаж стоек 1-9 этажи — 30.07.2026; остекление 1-9 этажи — 25.09.2026; примыкания и сдача — 30.12.2026.",
      },
      {
        id: "mr-p3-weather",
        clause: "п. 3.6",
        text: "Сроки продлеваются на период неблагоприятных погодных условий, зафиксированных актом с участием представителя Заказчика.",
      },
    ],
  },
  {
    page: 4,
    title: "Ответственность и приемка",
    blocks: [
      {
        id: "mr-p4-penalty",
        clause: "п. 5.1",
        text: "Пени за просрочку — 0,05% от цены договора за каждый день, но не более 10% цены договора.",
      },
      {
        id: "mr-p4-acceptance",
        clause: "п. 6.2",
        text: "Приемка производится поэтажно с оформлением акта освидетельствования; итоговая приемка — по завершении пусконаладки систем вентиляции фасада.",
      },
      {
        id: "mr-p4-warranty",
        clause: "п. 7.1",
        text: "Гарантийный срок — 36 месяцев, на герметизацию швов — 24 месяца.",
      },
    ],
  },
];

const shPages: ContractPage[] = [
  {
    page: 1,
    title: "Контракт 44-ФЗ №0173200001426000891. Предмет",
    blocks: [
      {
        id: "sh-p1-subject",
        clause: "п. 1.1",
        text: "Выполнение работ по капитальному ремонту фасада здания школы №1547, площадь работ 4 100 м².",
      },
    ],
  },
  {
    page: 2,
    title: "Цена контракта",
    blocks: [
      { id: "sh-p2-sum", clause: "п. 2.1", text: "Цена контракта — 18 300 000 рублей, НДС не облагается. Авансирование не предусмотрено." },
    ],
  },
  {
    page: 3,
    title: "Сроки",
    blocks: [
      { id: "sh-p3-terms", clause: "п. 3.1", text: "Срок выполнения: с 15.05.2026 по 20.08.2026." },
      { id: "sh-p3-stages", clause: "п. 3.2", text: "Этап 1 — подготовка и утепление до 10.07.2026; этап 2 — облицовка и сдача до 20.08.2026." },
    ],
  },
  {
    page: 4,
    title: "Ответственность и приемка",
    blocks: [
      { id: "sh-p4-penalty", clause: "п. 6.3", text: "Пени начисляются в размере 1/300 ключевой ставки ЦБ РФ от цены контракта за каждый день просрочки." },
      { id: "sh-p4-acceptance", clause: "п. 7.1", text: "Приемка комиссией заказчика в течение 10 рабочих дней с даты уведомления о завершении работ." },
      { id: "sh-p4-warranty", clause: "п. 8.1", text: "Гарантийный срок на результат работ — 60 месяцев." },
    ],
  },
];

export const contracts: ContractDoc[] = [
  {
    id: "C-114",
    docId: "D-8801",
    projectId: "obj-severnaya-korona",
    customer: "ГК «Стройинвест»",
    number: "СИ-2025/114-НВФ",
    date: "2026-02-10",
    sum: 78400000,
    status: "review",
    agent: "Парсер договоров",
    parsedAt: "2026-02-11T11:44:00+03:00",
    tasksCreated: 4,
    pages: skPages,
    fields: [
      { key: "parties", label: "Стороны", value: "Заказчик: ООО «ГК Стройинвест»; Подрядчик: ООО СК «Фасадные системы»", confidence: "high", page: 1, quoteId: "sk-p1-parties", clause: "преамбула" },
      { key: "subject", label: "Предмет", value: "НВФ корпуса 3, 12 400 м², керамогранит 600х600", confidence: "high", page: 1, quoteId: "sk-p1-subject", clause: "п. 1.1" },
      { key: "sum", label: "Сумма договора", value: "78 400 000 ₽, в т.ч. НДС 20%", confidence: "high", page: 2, quoteId: "sk-p2-sum", clause: "п. 2.1" },
      { key: "advance", label: "Аванс", value: "20% — 15 680 000 ₽, 10 банковских дней", confidence: "high", page: 2, quoteId: "sk-p2-advance", clause: "п. 2.3" },
      { key: "terms", label: "Сроки", value: "02.03.2026 — 28.11.2026", confidence: "high", page: 3, quoteId: "sk-p3-terms", clause: "п. 3.1" },
      { key: "stages", label: "Этапы", value: "5 этапов: замеры, подсистема, утеплитель, облицовка, сдача", confidence: "medium", page: 3, quoteId: "sk-p3-stages", clause: "п. 3.2" },
      { key: "checkpoints", label: "Контрольные точки", value: "Исполнительная документация — 5 рабочих дней после этажа; по 5-8 этажам — 11.08.2026", confidence: "medium", page: 3, quoteId: "sk-p3-checkpoints", clause: "п. 3.4" },
      { key: "penalty", label: "Штрафы и пени", value: "Пени 0,1% в день от стоимости этапа, не более 5%; штраф за качество 150 000 ₽", confidence: "low", page: 4, quoteId: "sk-p4-penalty", clause: "п. 5.2" },
      { key: "warranty", label: "Гарантийный срок", value: "60 месяцев с даты итогового акта", confidence: "high", page: 5, quoteId: "sk-p5-warranty", clause: "п. 7.1" },
      { key: "acceptance", label: "Порядок приемки", value: "Ежемесячно КС-2/КС-3, рассмотрение 7 рабочих дней", confidence: "high", page: 5, quoteId: "sk-p5-acceptance", clause: "п. 6.1" },
    ],
    milestones: [
      { id: "cm-114-1", title: "Передать исполнительную документацию по 5-8 этажам", date: "2026-08-11", clause: "п. 3.4", taskTitle: "Передать исполнительную документацию по 5-8 этажам (из договора, п. 3.4)" },
      { id: "cm-114-2", title: "Завершить монтаж подсистемы, захватка 2", date: "2026-08-21", clause: "п. 3.2", taskTitle: "Завершить монтаж подсистемы, захватка 2 (из договора, п. 3.2)" },
      { id: "cm-114-3", title: "Уведомить заказчика об освидетельствовании скрытых работ", date: "2026-08-18", clause: "п. 6.4", taskTitle: "Уведомить заказчика об освидетельствовании скрытых работ (из договора, п. 6.4)" },
      { id: "cm-114-4", title: "Закрыть этап «Утеплитель и мембрана»", date: "2026-09-11", clause: "п. 3.2", taskTitle: "Закрыть этап «Утеплитель и мембрана» (из договора, п. 3.2)" },
      { id: "cm-114-5", title: "Сдать КС-2/КС-3 за август", date: "2026-09-05", clause: "п. 6.1", taskTitle: "Сдать КС-2/КС-3 за август (из договора, п. 6.1)" },
    ],
  },
  {
    id: "C-067",
    docId: "D-8911",
    projectId: "obj-meridian",
    customer: "АО «ПромСтрой Капитал»",
    number: "ПС-2025/067-СПК",
    date: "2026-01-23",
    sum: 95200000,
    status: "ready",
    agent: "Парсер договоров",
    parsedAt: "2026-01-23T18:02:00+03:00",
    tasksCreated: 6,
    pages: mrPages,
    fields: [
      { key: "parties", label: "Стороны", value: "Заказчик: АО «ПромСтрой Капитал»; Подрядчик: ООО СК «Фасадные системы»", confidence: "high", page: 1, quoteId: "mr-p1-parties", clause: "преамбула" },
      { key: "subject", label: "Предмет", value: "Стоечно-ригельный витраж, 8 900 м²", confidence: "high", page: 1, quoteId: "mr-p1-subject", clause: "п. 1.1" },
      { key: "sum", label: "Сумма договора", value: "95 200 000 ₽, в т.ч. НДС 20%", confidence: "high", page: 2, quoteId: "mr-p2-sum", clause: "п. 2.1" },
      { key: "advance", label: "Аванс", value: "30% двумя траншами (15% + 15%)", confidence: "medium", page: 2, quoteId: "mr-p2-advance", clause: "п. 2.2" },
      { key: "terms", label: "Сроки", value: "19.01.2026 — 30.12.2026", confidence: "high", page: 3, quoteId: "mr-p3-terms", clause: "п. 3.1" },
      { key: "stages", label: "Этапы", value: "4 этапа: поставка профиля, стойки, остекление, сдача", confidence: "high", page: 3, quoteId: "mr-p3-stages", clause: "п. 3.3" },
      { key: "checkpoints", label: "Контрольные точки", value: "Поставка профиля 15.04.2026; остекление 1-9 эт. 25.09.2026", confidence: "medium", page: 3, quoteId: "mr-p3-stages", clause: "п. 3.3" },
      { key: "penalty", label: "Штрафы и пени", value: "0,05% в день, не более 10% цены договора", confidence: "high", page: 4, quoteId: "mr-p4-penalty", clause: "п. 5.1" },
      { key: "warranty", label: "Гарантийный срок", value: "36 месяцев; герметизация швов — 24 месяца", confidence: "high", page: 4, quoteId: "mr-p4-warranty", clause: "п. 7.1" },
      { key: "acceptance", label: "Порядок приемки", value: "Поэтажно, акты освидетельствования; итог — после пусконаладки", confidence: "medium", page: 4, quoteId: "mr-p4-acceptance", clause: "п. 6.2" },
    ],
    milestones: [
      { id: "cm-067-1", title: "Подтвердить поставку профиля на объект", date: "2026-08-25", clause: "п. 2.2", taskTitle: "Подтвердить поставку профиля на объект (из договора, п. 2.2)" },
      { id: "cm-067-2", title: "Закрыть остекление 1-9 этажей", date: "2026-09-25", clause: "п. 3.3", taskTitle: "Закрыть остекление 1-9 этажей (из договора, п. 3.3)" },
      { id: "cm-067-3", title: "Оформить акт по погодным условиям за август", date: "2026-09-01", clause: "п. 3.6", taskTitle: "Оформить акт по погодным условиям за август (из договора, п. 3.6)" },
    ],
  },
  {
    id: "C-891",
    docId: "D-9012",
    projectId: "obj-school-1547",
    customer: "ГБОУ «Школа №1547»",
    number: "0173200001426000891",
    date: "2026-05-06",
    sum: 18300000,
    status: "recognizing",
    agent: "Парсер договоров",
    parsedAt: "2026-08-15T16:40:00+03:00",
    tasksCreated: 0,
    pages: shPages,
    fields: [],
    milestones: [],
  },
];

export const getContract = (id: string) => contracts.find((c) => c.id === id);
