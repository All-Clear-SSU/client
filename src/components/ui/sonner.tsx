"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { cn } from "./utils";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className={cn("toaster group")}
      position="top-right"
      richColors
      expand
      closeButton
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: cn(
            "group-[.toaster]:bg-slate-900 group-[.toaster]:text-white",
            "group-[.toaster]:border group-[.toaster]:border-slate-700",
            "group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg group-[.toaster]:text-sm"
          ),
          description: "text-slate-400",
          actionButton:
            "group-[.toaster]:bg-blue-600 group-[.toaster]:text-white group-[.toaster]:hover:bg-blue-700",
          cancelButton:
            "group-[.toaster]:bg-slate-700 group-[.toaster]:text-white group-[.toaster]:hover:bg-slate-600",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };