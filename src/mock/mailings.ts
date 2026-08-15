/** Рассылки заказчикам. Любая отправка в прототипе — демо-имитация. */

export interface MailTemplate {
  id: string;
  name: string;
  trigger: string;
  subject: string;
  body: string;
  agent: string;
}

export const mailTemplates: MailTemplate[] = [
  {
    id: "T-1",
    name: "Недельная сводка по объекту",
    trigger: "Каждую пятницу, 18:00",
    subject: "{{Объект}} — сводка за неделю на {{Дата}}",
    agent: "Составитель писем",
    body: `Уважаемый(ая) {{Заказчик}},

направляем еженедельную сводку по объекту «{{Объект}}» на {{Дата}}.

Готовность: {{Готовность}}
Этапы:
{{СтатусыЭтапов}}

Выполнено за неделю: {{ОбъемЗаНеделю}}
Отклонение план-факт: {{Отклонение}}

С уважением,
{{РП}}, руководитель проекта
СК «Фасадные системы»`,
  },
  {
    id: "T-2",
    name: "Риск срыва срока этапа",
    trigger: "Просрочка этапа или прогноз отставания",
    subject: "{{Объект}} — риск смещения срока этапа «{{Этап}}»",
    agent: "Контролер сроков",
    body: `Уважаемый(ая) {{Заказчик}},

по объекту «{{Объект}}» фиксируем риск смещения срока этапа «{{Этап}}» (плановое завершение — {{Дата}}).

Причина: {{Причина}}
Предлагаемые меры: {{Меры}}
Прогноз завершения: {{Прогноз}}

Просим согласовать корректировку графика.

С уважением,
{{РП}}, руководитель проекта`,
  },
  {
    id: "T-3",
    name: "Завершение этапа и приемка",
    trigger: "Контрольная точка выполнена",
    subject: "{{Объект}} — этап «{{Этап}}» завершен, приглашение на приемку",
    agent: "Составитель писем",
    body: `Уважаемый(ая) {{Заказчик}},

сообщаем о завершении этапа «{{Этап}}» по объекту «{{Объект}}» {{Дата}}.

Объем: {{Объем}}
Статусы этапов:
{{СтатусыЭтапов}}

Просим направить представителя для приемки скрытых работ.

С уважением,
{{РП}}, руководитель проекта`,
  },
];

export type MailEvent =
  | "checkpoint_7d"
  | "stage_overdue"
  | "report_missing_2d"
  | "weekly_digest"
  | "stage_done";

export const mailEventLabels: Record<MailEvent, string> = {
  checkpoint_7d: "Контрольная точка через 7 дней",
  stage_overdue: "Просрочка этапа",
  report_missing_2d: "Отчёт не сдан 2 дня",
  weekly_digest: "Недельная сводка",
  stage_done: "Этап завершен",
};

export interface MailRule {
  id: string;
  event: MailEvent;
  templateId: string;
  recipients: string[];
  channel: "e-mail";
  schedule: string;
  enabled: boolean;
  requiresApproval: boolean;
}

export const mailRules: MailRule[] = [
  {
    id: "R-1",
    event: "weekly_digest",
    templateId: "T-1",
    recipients: ["Заказчик", "РП"],
    channel: "e-mail",
    schedule: "Пятница, 18:00",
    enabled: true,
    requiresApproval: true,
  },
  {
    id: "R-2",
    event: "checkpoint_7d",
    templateId: "T-2",
    recipients: ["Заказчик", "РП"],
    channel: "e-mail",
    schedule: "В 09:00 в день срабатывания",
    enabled: true,
    requiresApproval: true,
  },
  {
    id: "R-3",
    event: "stage_overdue",
    templateId: "T-2",
    recipients: ["Заказчик", "РП", "Генеральный директор"],
    channel: "e-mail",
    schedule: "Сразу при фиксации просрочки",
    enabled: true,
    requiresApproval: true,
  },
  {
    id: "R-4",
    event: "report_missing_2d",
    templateId: "T-2",
    recipients: ["РП"],
    channel: "e-mail",
    schedule: "Ежедневно, 20:00",
    enabled: true,
    requiresApproval: true,
  },
  {
    id: "R-5",
    event: "stage_done",
    templateId: "T-3",
    recipients: ["Заказчик", "РП"],
    channel: "e-mail",
    schedule: "В течение часа после приемки отчёта",
    enabled: false,
    requiresApproval: true,
  },
];

export type OutgoingStatus = "pending" | "sent" | "rejected" | "draft";

export const outgoingStatusLabels: Record<OutgoingStatus, string> = {
  pending: "Ожидает подтверждения",
  sent: "Отправлено (демо)",
  rejected: "Отклонено",
  draft: "Черновик",
};

export interface OutgoingMail {
  id: string;
  createdAt: string;
  projectId: string;
  customer: string;
  to: string;
  templateId: string;
  templateName: string;
  subject: string;
  body: string;
  status: OutgoingStatus;
  agent: string;
  reason: string;
}

export const outgoingMails: OutgoingMail[] = [
  {
    id: "M-4471",
    createdAt: "2026-08-15T09:10:00+03:00",
    projectId: "obj-severnaya-korona",
    customer: "ГК «Стройинвест»",
    to: "pantev@stroyinvest.example",
    templateId: "T-2",
    templateName: "Риск срыва срока этапа",
    subject: "ЖК «Северная Корона», к3 — риск смещения срока этапа «Облицовка»",
    status: "pending",
    agent: "Контролер сроков",
    reason: "Отставание по захватке 2: 3 дня, факт ниже плана на 14%",
    body: `Уважаемый Алексей Викторович,

по объекту ЖК «Северная Корона», корпус 3 фиксируем риск смещения срока этапа «Облицовка» (плановое завершение — 23.10.2026).

Причина: задержка поставки кронштейна КР-150 на захватку 2 и отставание монтажа на 3 дня.
Предлагаемые меры: вторая бригада на захватке 2 с 18.08.2026, ускоренная поставка от «МеталлПрофиль-Юг».
Прогноз завершения: 29.10.2026.

Просим согласовать корректировку графика по захватке 2.

С уважением,
Соколов И.П., руководитель проекта`,
  },
  {
    id: "M-4465",
    createdAt: "2026-08-14T18:00:00+03:00",
    projectId: "obj-meridian",
    customer: "АО «ПромСтрой Капитал»",
    to: "kuznecova@promstroy.example",
    templateId: "T-1",
    templateName: "Недельная сводка по объекту",
    subject: "БЦ «Меридиан» — сводка за неделю на 14.08.2026",
    status: "sent",
    agent: "Составитель писем",
    reason: "Правило: недельная сводка, пятница 18:00",
    body: `Уважаемая Ирина Сергеевна,

направляем еженедельную сводку по объекту БЦ «Меридиан» на 14.08.2026.

Готовность: 38%
Этапы: поставка профиля — выполнено; монтаж стоек 1-9 — в работе (74%); остекление — не начато.
Выполнено за неделю: 412 м²
Отклонение план-факт: −8%

С уважением,
Соколов И.П., руководитель проекта`,
  },
  {
    id: "M-4458",
    createdAt: "2026-08-12T11:25:00+03:00",
    projectId: "obj-severnaya-korona",
    customer: "ГК «Стройинвест»",
    to: "pantev@stroyinvest.example",
    templateId: "T-3",
    templateName: "Завершение этапа и приемка",
    subject: "ЖК «Северная Корона», к3 — этап «Утеплитель, захватка 1» завершен",
    status: "sent",
    agent: "Составитель писем",
    reason: "Контрольная точка выполнена, подтверждено РП",
    body: `Уважаемый Алексей Викторович,

сообщаем о завершении этапа «Утеплитель и мембрана, захватка 1» 11.08.2026.

Объем: 2 480 м²
Просим направить представителя для приемки скрытых работ 18.08.2026.

С уважением,
Соколов И.П., руководитель проекта`,
  },
  {
    id: "M-4442",
    createdAt: "2026-08-07T20:00:00+03:00",
    projectId: "obj-school-1547",
    customer: "ГБОУ «Школа №1547»",
    to: "zavhoz@school1547.example",
    templateId: "T-1",
    templateName: "Недельная сводка по объекту",
    subject: "Школа №1547 — сводка за неделю на 07.08.2026",
    status: "rejected",
    agent: "Составитель писем",
    reason: "Отклонено РП: до приемки КС-2 сводку не направляем",
    body: `Уважаемая Наталья Петровна,

направляем еженедельную сводку по объекту «Школа №1547» на 07.08.2026.

Готовность: 88%
Этапы: подготовка и утепление — выполнено; облицовка и сдача — в работе.

С уважением,
Соколов И.П., руководитель проекта`,
  },
];

export interface EscalationRule {
  id: string;
  condition: string;
  action: string;
  enabled: boolean;
}

export const escalationRules: EscalationRule[] = [
  {
    id: "E-1",
    condition: "Отчёт с объекта не сдан 2 дня",
    action: "Уведомление руководителю проекта в Telegram и на e-mail",
    enabled: true,
  },
  {
    id: "E-2",
    condition: "Отчёт с объекта не сдан 4 дня",
    action: "Эскалация генеральному директору, копия РП",
    enabled: true,
  },
  {
    id: "E-3",
    condition: "Просрочка контрольной точки договора более 3 дней",
    action: "Уведомление РП и подготовка черновика письма заказчику",
    enabled: true,
  },
  {
    id: "E-4",
    condition: "Заявка поставщику без ответа 3 дня",
    action: "Уведомление снабженцу, копия РП",
    enabled: false,
  },
];
