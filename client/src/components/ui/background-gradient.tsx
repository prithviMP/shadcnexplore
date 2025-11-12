import { cn } from "@/lib/utils";

export function BackgroundGradient({
  children,
  className,
  containerClassName,
}: {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <div className={cn("relative p-[2px] group", containerClassName)}>
      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 opacity-60 blur group-hover:opacity-100 transition duration-500" />
      <div className={cn("relative rounded-lg bg-card", className)}>
        {children}
      </div>
    </div>
  );
}
