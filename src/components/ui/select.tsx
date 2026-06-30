import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Branded drop-in for a native <select>. Keeps the OS-native option menu (reliable,
 * accessible, keyboard-friendly) but replaces the ugly default chevron with a quiet
 * one and aligns the trigger with the rest of the forest-green UI. Same props as a
 * <select>; `containerClassName` sizes the wrapper (e.g. "w-full").
 */
export function Select({
  className,
  containerClassName,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { containerClassName?: string }) {
  return (
    <div className={cn("relative inline-flex", containerClassName)}>
      <select
        {...props}
        className={cn(
          "h-9 w-full cursor-pointer appearance-none rounded-md border border-border bg-card pl-3 pr-9 text-sm text-foreground shadow-xs transition-colors",
          "hover:border-brand-sage/60 focus-visible:border-brand-sage focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
