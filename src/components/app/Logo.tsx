import React from "react";
import { Anchor } from "lucide-react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  subtitle?: string;
  className?: string;
}

export function Logo({ size = "md", iconOnly = false, subtitle, className = "" }: LogoProps) {
  const iconSizes = {
    sm: "size-8 rounded-lg",
    md: "size-10 rounded-xl",
    lg: "size-14 rounded-2xl",
  };

  const anchorSizes = {
    sm: "size-4",
    md: "size-5",
    lg: "size-7",
  };

  const textSizes = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* All Yellow Anchor Badge matching original HarborX theme */}
      <div
        className={`relative flex items-center justify-center bg-primary text-primary-foreground glow-primary font-bold transition-transform hover:scale-105 ${iconSizes[size]}`}
      >
        <Anchor className={`${anchorSizes[size]} stroke-[2.5]`} />
        <span className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/10" />
      </div>

      {!iconOnly && (
        <div className="flex flex-col">
          <span className={`font-bold tracking-tight text-foreground ${textSizes[size]}`}>
            Harbor<span className="text-primary">X</span>
          </span>
          {subtitle && (
            <span className="text-xs text-muted-foreground font-medium tracking-wide">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
