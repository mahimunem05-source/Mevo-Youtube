import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative isolate overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer magnetic transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn-aurora text-primary-foreground shadow",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function createRipple(event: React.MouseEvent<HTMLElement>) {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  const span = document.createElement("span");
  const size = Math.max(rect.width, rect.height);
  span.style.cssText = `position:absolute;left:${event.clientX - rect.left - size / 2}px;top:${
    event.clientY - rect.top - size / 2
  }px;width:${size}px;height:${size}px;border-radius:9999px;background:color-mix(in oklab, var(--primary) 45%, transparent);opacity:.55;pointer-events:none;z-index:0;animation:ripple-out .65s var(--ease-premium) forwards;`;
  el.appendChild(span);
  setTimeout(() => span.remove(), 700);
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onMouseDown, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const { children, ...rest } = props;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
          createRipple(event);
          onMouseDown?.(event);
        }}
        {...rest}
      >
        {asChild ? (
          children
        ) : (
          <span className="relative z-10 inline-flex items-center justify-center gap-2">
            {children}
          </span>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
