"use client";

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "../../lib/utils"; // 절대경로 import (Vite alias 설정 기준)

/**
 * Separator (Radix UI + Tailwind + cn)
 * - orientation: "horizontal" | "vertical"
 * - decorative: boolean (기본값: true)
 */
const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "bg-border shrink-0",
      orientation === "horizontal"
        ? "h-px w-full"
        : "h-full w-px",
      className
    )}
    {...props}
  />
));

Separator.displayName = "Separator";

export { Separator };