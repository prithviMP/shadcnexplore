import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

interface SignalBadgeProps {
  signal: "BUY" | "SELL" | "HOLD";
  showIcon?: boolean;
}

export default function SignalBadge({ signal, showIcon = true }: SignalBadgeProps) {
  const variants = {
    BUY: {
      className: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/20",
      icon: ArrowUp
    },
    SELL: {
      className: "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20",
      icon: ArrowDown
    },
    HOLD: {
      className: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20",
      icon: Minus
    }
  };

  const { className, icon: Icon } = variants[signal];

  return (
    <Badge variant="outline" className={`${className} rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide`} data-testid={`badge-signal-${signal.toLowerCase()}`}>
      {showIcon && <Icon className="w-3 h-3 mr-1" />}
      {signal}
    </Badge>
  );
}
