import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Тосты ADR-045, раздел 4.5: один за раз, ширина экрана минус 32 (до 400), высота от 48,
 * текст text-body, действие «Отменить» text-body-strong акцентом, одна мягкая тень.
 * Место (внизу над нижним слоем) задаёт оболочка в __root.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      visibleToasts={1}
      containerAriaLabel="Уведомления"
      style={{ width: "min(400px, calc(100vw - 32px))" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast flex min-h-12 w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-2 text-body text-text shadow-pop",
          title: "text-body",
          description: "text-meta text-text-2",
          actionButton:
            "!ms-auto !h-11 !shrink-0 !bg-transparent !px-2 !text-body-strong !text-orange",
          cancelButton: "!h-11 !bg-transparent !px-2 !text-body !text-text-2",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
