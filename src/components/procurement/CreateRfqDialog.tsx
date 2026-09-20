import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, MapPin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactFreshnessBadge } from "@/components/procurement/ContactFreshnessBadge";
import { isReadyForRequest } from "@/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNow } from "@/api/clock";
import { queries } from "@/api/queries";
import { useCatalog, useSupplierCandidates } from "@/api/catalog";
import { fmtDate, fmtNum } from "@/lib/format";
import { toast } from "@/lib/toast";
import { DEMO_MAIL_NOTE } from "@/lib/demo-copy";
import { cn } from "@/lib/utils";
import { type Project, type SupplierProfile } from "@/contracts";
import { useDirectory } from "@/api/directory";
import { useCreateRequest } from "@/api/mutations";

const steps = ["Позиции", "Поставщики", "Письмо", "Предпросмотр"] as const;

function fill(text: string, values: Record<string, string>) {
  return text.replace(/\{([^}]+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

/**
 * Создание запроса поставщикам: позиции → подбор поставщиков по категории и региону →
 * шаблон письма → предпросмотр для каждого получателя → отправка.
 */
const EMPTY: never[] = [];

export function CreateRfqDialog({
  open,
  onOpenChange,
  project,
  region,
  initialIds,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  region: string;
  initialIds: string[];
  onCreated?: (requestId: string) => void;
}) {
  const { employeeById, counterpartyById } = useDirectory();
  const createRequest = useCreateRequest();
  // Позиции загружаются, только пока мастер открыт
  // Готовые к запросу позиции фильтрует сервер; страницы догружаются, пока мастер открыт
  const positionsQuery = useInfiniteQuery({
    ...queries.positionPages({ projectId: project.id, readyForRequest: true, limit: 200 }),
    enabled: open,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = positionsQuery;
  useEffect(() => {
    if (open && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage]);
  const positions = useMemo(
    () => positionsQuery.data?.pages.flatMap((page) => page.items) ?? EMPTY,
    [positionsQuery.data],
  );
  const supplierList = useQuery({ ...queries.suppliers(), enabled: open }).data;
  const profiles = useMemo(() => (supplierList ?? []).map((item) => item.profile), [supplierList]);
  const eligible = useMemo(
    () => positions.filter((item) => item.projectId === project.id && isReadyForRequest(item)),
    [positions, project.id],
  );

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suppliers, setSuppliers] = useState<Set<string>>(new Set());
  const [showOtherRegions, setShowOtherRegions] = useState(false);
  const emailTemplates = useQuery({ ...queries.templates(), enabled: open }).data ?? [];
  const [templateId, setTemplateId] = useState<string>(emailTemplates[0]?.id ?? "");
  const [subject, setSubject] = useState<string>(emailTemplates[0]?.subject ?? "");
  const [body, setBody] = useState<string>(emailTemplates[0]?.body ?? "");
  const now = useNow();
  const [dueDate, setDueDate] = useState(() =>
    new Date(new Date(now).getTime() + 3 * 86_400_000).toISOString().slice(0, 10),
  );
  const [previewFor, setPreviewFor] = useState<string | null>(null);

  const selectedItems = useMemo(
    () => eligible.filter((item) => selected.has(item.id)),
    [eligible, selected],
  );
  // Кому уходит запрос — по категориям материалов выбранных позиций и региону (ADR-014, п. 6)
  const { categoryById } = useCatalog();
  const picked = useSupplierCandidates(selectedItems, region, open);
  const categories = picked.needed.map((id) => categoryById.get(id)?.name ?? id);
  const matched = picked.candidates.map((candidate) => ({
    profile: candidate.profile,
    categoryMatch: candidate.matched.map((id) => categoryById.get(id)?.name ?? id),
    regionMatch: candidate.regionMatch,
    // Среднее время ответа — по фактическим ответам поставщика, а не из справочника (ADR-014)
    replyHours:
      supplierList?.find((item) => item.supplier.id === candidate.profile.supplierId)?.stats
        .avgReplyHours ?? null,
  }));
  const inRegion = matched.filter((m) => m.regionMatch);
  const otherRegions = matched.filter((m) => !m.regionMatch);

  // При открытии: выбранные в реестре позиции, иначе все готовые к запросу. Ждём загрузки позиций:
  // при пустом кеше мастер открывается раньше, чем приходит список
  const preselected = useRef(false);
  const positionsLoaded = positionsQuery.isSuccess && !hasNextPage;
  useEffect(() => {
    if (!open) {
      preselected.current = false;
      return;
    }
    if (preselected.current || !positionsLoaded) return;
    preselected.current = true;
    setStep(0);
    const initial = initialIds.filter((id) => eligible.some((item) => item.id === id));
    setSelected(new Set(initial.length ? initial : eligible.map((item) => item.id)));
    setShowOtherRegions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, positionsLoaded]);

  // Поставщики по умолчанию: свой регион, контакт не устарел
  useEffect(() => {
    if (step !== 1) return;
    setSuppliers((prev) =>
      prev.size
        ? prev
        : new Set(
            inRegion
              .filter((m) => m.profile.contactStatus !== "stale")
              .map((m) => m.profile.supplierId),
          ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Шаблоны приходят запросом: как только список загружен, подставляем первый
  const firstTemplate = emailTemplates[0];
  useEffect(() => {
    if (templateId || !firstTemplate) return;
    setTemplateId(firstTemplate.id);
    setSubject(firstTemplate.subject);
    setBody(firstTemplate.body);
  }, [templateId, firstTemplate]);

  function pickTemplate(id: string) {
    const template = emailTemplates.find((t) => t.id === id) ?? emailTemplates[0];
    if (!template) return;
    setTemplateId(template.id);
    setSubject(template.subject);
    setBody(template.body);
  }

  const author = employeeById("e-dorohov");
  const recipients = [...suppliers];
  const currentPreview =
    previewFor && suppliers.has(previewFor) ? previewFor : (recipients[0] ?? null);
  const values = (supplierId: string | null) => {
    const profile = profiles.find((p) => p.supplierId === supplierId);
    return {
      объект: project.name,
      регион: region,
      позиций: String(selectedItems.length),
      контакт: profile?.contactName ?? "коллеги",
      срок: fmtDate(`${dueDate}T18:00:00`),
      подпись: `${author?.name ?? "Снабжение"}, ${author?.position ?? ""}\n${author?.phone ?? ""}`,
    };
  };

  const nextHint = [
    "Выберите хотя бы одну позицию",
    "Выберите хотя бы одного поставщика",
    "Заполните тему и текст письма",
    "",
  ];
  const canNext = [
    selectedItems.length > 0,
    suppliers.size > 0,
    subject.trim().length > 0 && body.trim().length > 0,
    true,
  ][step];

  function send() {
    createRequest.mutate(
      {
        projectId: project.id,
        positionIds: [...selected],
        supplierIds: recipients,
        templateId: templateId || null,
        replyDueAt: `${dueDate}T18:00:00`,
      },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          setSuppliers(new Set());
          toast.success(`Запрос ${result.request.number} создан`, {
            description: `${fmtNum(result.positions)} поз. · ${recipients.length} ${recipients.length === 1 ? "поставщик" : "поставщика"}. ${DEMO_MAIL_NOTE}`,
          });
          onCreated?.(result.request.id);
        },
        onError: (error) => toast.error("Запрос не создан", { description: error.message }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[88vh] sm:max-w-[720px] sm:rounded-[var(--r-lg)]">
        <DialogHeader className="border-b border-border px-5 pt-5 pb-3 text-left">
          <DialogTitle>Запрос поставщикам</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {project.name} · регион {region}
          </DialogDescription>
          <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Шаги">
            {steps.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={index > step}
                  onClick={() => setStep(index)}
                  aria-current={index === step ? "step" : undefined}
                  className="w-full text-left disabled:cursor-default"
                >
                  <span
                    className={cn(
                      "block h-1 rounded-full",
                      index <= step ? "bg-text" : "bg-subtle",
                    )}
                  />
                  <span
                    className={cn(
                      "mt-1 block truncate text-[11px]",
                      index === step ? "font-semibold text-text-primary" : "text-text-muted",
                    )}
                  >
                    {index + 1}. {label}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && (
            <>
              {eligible.length === 0 ? (
                <p className="rounded-[var(--r-md)] bg-subtle px-4 py-6 text-center text-[13px] text-text-secondary">
                  Нет позиций, готовых к запросу. Проверьте позиции на экране извлечения и передайте
                  их в закупку — они появятся здесь.
                </p>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-caption text-text-secondary">
                      Выбрано{" "}
                      <b className="tnum text-text-primary">{fmtNum(selectedItems.length)}</b> из{" "}
                      {fmtNum(eligible.length)} готовых к запросу
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelected(
                          selected.size === eligible.length
                            ? new Set()
                            : new Set(eligible.map((i) => i.id)),
                        )
                      }
                    >
                      {selected.size === eligible.length ? "Снять все" : "Выбрать все"}
                    </Button>
                  </div>
                  <ul className="divide-y divide-border rounded-[var(--r-md)] border border-border">
                    {eligible.map((item) => (
                      <li key={item.id}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-hover">
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={(v) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              })
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {item.normalizedName ?? item.projectName}
                            </span>
                            <span className="block truncate text-caption text-text-muted">
                              {item.group} · поз. {item.position} · лист {item.sheetNumber}
                            </span>
                          </span>
                          <span className="tnum shrink-0 text-[13px]">
                            {fmtNum(item.qty)} {item.unit}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-caption text-text-secondary">
                Подобраны по категориям материалов{" "}
                <b className="text-text-primary">{categories.join(", ")}</b> и региону{" "}
                <b className="text-text-primary">{region}</b>. Проверьте актуальность контакта перед
                отправкой.
              </p>
              <SupplierList items={inRegion} selected={suppliers} onToggle={setSuppliers} />
              {inRegion.length === 0 && (
                <p className="mt-3 rounded-[var(--r-md)] bg-warn-bg px-3 py-2 text-caption text-warn">
                  В регионе {region} нет поставщиков этих категорий. Посмотрите соседние регионы
                  ниже.
                </p>
              )}
              {otherRegions.length > 0 && (
                <div className="mt-4">
                  <Button size="sm" variant="ghost" onClick={() => setShowOtherRegions((v) => !v)}>
                    {showOtherRegions ? "Скрыть" : "Показать"} поставщиков из других регионов ·{" "}
                    {otherRegions.length}
                  </Button>
                  {showOtherRegions && (
                    <SupplierList
                      items={otherRegions}
                      selected={suppliers}
                      onToggle={setSuppliers}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div className="grid gap-3">
              <div className="grid gap-2 sm:grid-cols-3">
                {emailTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={templateId === template.id}
                    onClick={() => pickTemplate(template.id)}
                    className={cn(
                      "min-h-11 rounded-[var(--r-md)] border px-3 py-2 text-left text-[13px] transition-fast",
                      templateId === template.id
                        ? "border-line-2 bg-surface-3 font-medium"
                        : "border-border hover:bg-hover",
                    )}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
              <label className="grid gap-1.5 text-caption text-text-secondary">
                Тема
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="grid gap-1.5 text-caption text-text-secondary">
                Текст письма
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  className="font-[inherit] text-[13px] leading-relaxed"
                />
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1.5 text-caption text-text-secondary">
                  Ждём ответ до
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-auto"
                  />
                </label>
                <p className="flex-1 text-caption text-text-muted">
                  Подстановки: {"{объект}"}, {"{регион}"}, {"{позиций}"}, {"{контакт}"}, {"{срок}"},{" "}
                  {"{подпись}"}. Перечень позиций уйдёт вложением XLSX.
                </p>
              </div>
            </div>
          )}

          {step === 3 && currentPreview && (
            <div className="grid gap-3">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {recipients.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={id === currentPreview}
                    onClick={() => setPreviewFor(id)}
                    className={cn(
                      "min-h-11 shrink-0 rounded-full border px-3 text-[13px] lg:min-h-8",
                      id === currentPreview
                        ? "border-ink bg-ink text-primary-foreground"
                        : "border-border text-text-secondary hover:bg-hover",
                    )}
                  >
                    {counterpartyById(id)?.name}
                  </button>
                ))}
              </div>
              <article className="rounded-[var(--r-md)] border border-border">
                <dl className="grid gap-1 border-b border-border px-4 py-3 text-[13px]">
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-text-muted">Кому</dt>
                    <dd className="min-w-0 truncate">
                      {profiles.find((p) => p.supplierId === currentPreview)?.email}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-text-muted">Тема</dt>
                    <dd className="font-medium">{fill(subject, values(currentPreview))}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-text-muted">Вложение</dt>
                    <dd>Перечень_{selectedItems.length}_поз.xlsx</dd>
                  </div>
                </dl>
                <p className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-line">
                  {fill(body, values(currentPreview))}
                </p>
              </article>
              <p className="text-caption text-text-muted">
                Так письмо будет выглядеть для поставщика. {DEMO_MAIL_NOTE} Цены из ответов попадут
                в сравнение со ссылкой на источник.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 border-t border-border px-5 py-3 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
          >
            {step === 0 ? (
              "Отмена"
            ) : (
              <>
                <ChevronLeft className="size-4" /> Назад
              </>
            )}
          </Button>
          {step < steps.length - 1 ? (
            <div className="flex flex-1 items-center justify-end gap-3 sm:flex-none">
              {/* Почему «Далее» недоступно — видно рядом с кнопкой (ADR-015) */}
              {!canNext && (
                <span id="rfq-next-hint" className="text-caption text-text-muted">
                  {nextHint[step]}
                </span>
              )}
              <Button
                variant="accent"
                disabled={!canNext}
                aria-describedby={canNext ? undefined : "rfq-next-hint"}
                onClick={() => setStep(step + 1)}
                className="flex-1 sm:flex-none"
              >
                Далее: {steps[step + 1]} <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : (
            <Button variant="accent" onClick={send} className="flex-1 sm:flex-none">
              <Send className="size-4" /> Отправить {recipients.length}{" "}
              {recipients.length === 1 ? "поставщику" : "поставщикам"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierList({
  items,
  selected,
  onToggle,
}: {
  items: {
    profile: SupplierProfile;
    categoryMatch: string[];
    regionMatch: boolean;
    replyHours: number | null;
  }[];
  selected: Set<string>;
  onToggle: (update: (prev: Set<string>) => Set<string>) => void;
}) {
  const { counterpartyById } = useDirectory();
  return (
    <ul className="mt-3 divide-y divide-border rounded-[var(--r-md)] border border-border">
      {items.map(({ profile, categoryMatch, regionMatch, replyHours }) => {
        const supplier = counterpartyById(profile.supplierId);
        return (
          <li key={profile.supplierId}>
            <label className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-hover">
              <Checkbox
                className="mt-0.5"
                checked={selected.has(profile.supplierId)}
                onCheckedChange={(v) =>
                  onToggle((prev) => {
                    const next = new Set(prev);
                    if (v) next.add(profile.supplierId);
                    else next.delete(profile.supplierId);
                    return next;
                  })
                }
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium">{supplier?.name}</span>
                  <ContactFreshnessBadge status={profile.contactStatus} />
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <span
                    className={cn(
                      "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px]",
                      regionMatch ? "bg-ok-bg text-ok" : "bg-subtle text-text-secondary",
                    )}
                  >
                    {regionMatch && <Check className="size-3" />} {profile.region}
                  </span>
                  {categoryMatch.map((c) => (
                    <span
                      key={c}
                      className="inline-flex h-5 items-center gap-1 rounded-full bg-ok-bg px-2 text-[11px] text-ok"
                    >
                      <Check className="size-3" /> {c}
                    </span>
                  ))}
                </span>
                <span className="mt-1 block text-caption text-text-muted">
                  {profile.contactName} · {profile.email} ·{" "}
                  {replyHours === null ? "ответов ещё не было" : `отвечает за ${replyHours} ч`}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
