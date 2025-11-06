"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type RootProps = React.ComponentProps<typeof CheckboxPrimitive.Root>;
interface CheckboxProps extends RootProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "glass";
}

function Checkbox({
  className,
  size = "md",
  variant = "default",
  ...props
}: CheckboxProps) {
  const sizeClasses: Record<NonNullable<CheckboxProps["size"]>, string> = {
    sm: "size-3",
    md: "size-4",
    lg: "size-5",
    xl: "size-6",
  };
  const iconSizes: Record<NonNullable<CheckboxProps["size"]>, string> = {
    sm: "size-3",
    md: "size-3.5",
    lg: "size-4",
    xl: "size-4.5",
  };

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        sizeClasses[size],
        variant === "glass"
          ? "border-white/30 bg-white/5 supports-[backdrop-filter]:bg-white/10 backdrop-blur shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] data-[state=checked]:bg-primary/80 data-[state=checked]:border-white/50"
          : "border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary",
        "peer shrink-0 rounded-[6px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className={cn(iconSizes[size])} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }