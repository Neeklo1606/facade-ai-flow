/**
 * Форма «Газ v5» (ADR-066): на компьютере панель справа, на телефоне шторка снизу.
 * Шторка во всю ширину монитора растягивает поля на 1400 px и закрывает экран, с которого
 * человек добавляет запись; панель справа оставляет список видимым.
 */
import type { ReactNode } from "react";
import { Sheet, SidePanel } from "@/components/ui/kit/sheet";
import { useIsDesktop } from "@/components/gas-ops/review/use-layout";

export function AdaptiveSheet({
  open,
  onOpenChange,
  id,
  title,
  description,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  id: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  if (desktop) {
    return (
      <SidePanel
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        eyebrow={description}
        actions={actions}
      >
        {children}
      </SidePanel>
    );
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      id={id}
      title={title}
      {...(description ? { description } : {})}
      actions={actions}
    >
      {children}
    </Sheet>
  );
}
