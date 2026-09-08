import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      visibleToasts={3}
      style={{ width: 340 }}
      toastOptions={{
        classNames: {
          toast:
            "group toast w-[340px] rounded-[var(--r-md)] border border-border bg-[var(--bg-surface)] text-[13px] text-text-primary shadow-[var(--shadow-md)]",
          description: "text-caption text-text-secondary",
          actionButton: "rounded-[var(--r-pill)] bg-ink px-3 py-1 text-[12px] font-medium text-primary-foreground",
          cancelButton: "rounded-[var(--r-pill)] bg-subtle px-3 py-1 text-[12px] text-text-secondary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
