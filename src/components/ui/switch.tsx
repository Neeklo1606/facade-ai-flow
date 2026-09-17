import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-full p-[3px] focus-ring transition-colors duration-[160ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-orange data-[state=unchecked]:bg-surface-3",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block size-5 rounded-full bg-white transition-[transform,opacity] duration-[160ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] data-[state=checked]:translate-x-[18px] data-[state=checked]:opacity-100 data-[state=unchecked]:translate-x-0 data-[state=unchecked]:opacity-70",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
