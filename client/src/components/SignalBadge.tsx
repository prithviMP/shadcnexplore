import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus, AlertTriangle, X } from "lucide-react";

type SignalType = "BUY" | "SELL" | "HOLD" | "Check_OPM (Sell)" | "No Signal";

interface SignalBadgeProps {
  signal: SignalType | string;
  showIcon?: boolean;
}

export default function SignalBadge({ signal, showIcon = true }: SignalBadgeProps) {
  const variants: Record<string, { className: string; icon: typeof ArrowUp }> = {
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
    },
    "Check_OPM (Sell)": {
      className: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-orange-500/20",
      icon: AlertTriangle
    },
    "No Signal": {
      className: "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400 border-slate-500/20",
      icon: X
    }
  };

  // Normalize signal for matching (case-insensitive, handle variations)
  const normalizedSignal = typeof signal === 'string' ? signal.trim() : String(signal);
  const upperSignal = normalizedSignal.toUpperCase();
  
  // Check for exact matches first (case-insensitive)
  let variant;
  const exactMatch = variants[normalizedSignal] || variants[upperSignal] || variants[normalizedSignal.toLowerCase()];
  if (exactMatch) {
    variant = exactMatch;
  } 
  // Check if signal contains "SELL" (case-insensitive) - should be red
  else if (upperSignal.includes('SELL') && !upperSignal.includes('BUY')) {
    variant = variants.SELL;
  } 
  // Check if signal contains "BUY" (and not SELL) - should be green
  else if (upperSignal.includes('BUY') && !upperSignal.includes('SELL')) {
    variant = variants.BUY;
  } 
  // Check if signal is HOLD - should be yellow/amber
  else if (upperSignal === 'HOLD') {
    variant = variants.HOLD;
  } 
  // Default to HOLD for unknown signals
  else {
    variant = variants.HOLD;
  }

  const { className, icon: Icon } = variant;

  // Format signal text for display (handle special cases)
  const displayText = normalizedSignal === "Check_OPM (Sell)" ? "Check OPM" : normalizedSignal;

  return (
    <Badge variant="outline" className={`${className} rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide`} data-testid={`badge-signal-${signal.toLowerCase().replace(/\s+/g, '-')}`}>
      {showIcon && <Icon className="w-3 h-3 mr-1" />}
      {displayText}
    </Badge>
  );
}
