import React from "react";
import { Anchor } from "lucide-react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  subtitle?: string;
  className?: string;
}

export function Logo({
  size = "md",
  iconOnly = false,
  subtitle,
  className = "",
}: LogoProps) {
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
      {/* Stylized Glowing Anchor Badge */}
      <div
        className={`relative flex items-center justify-center bg-gradient-to-br from-primary to-blue-700 text-primary-foreground shadow-lg shadow-primary/25 border border-primary/40 ${iconSizes[size]}`}
      >
        <Anchor className={`${anchorSizes[size]} drop-shadow`} />
        <span className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/20" />
      </div>

      {!iconOnly && (
        <div className="flex flex-col">
          <span className={`font-bold tracking-tight text-foreground ${textSizes[size]}`}>
            Harbor<span className="text-primary drop-shadow-[0_0_12px_rgba(56,189,248,0.4)]">X</span>
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

