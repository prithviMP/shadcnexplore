import { cn } from "@/lib/utils";

export function MovingBorder({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative p-[1px] overflow-hidden rounded-lg", className)}>
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative bg-background rounded-lg h-full w-full">
        {children}
      </div>
    </div>
  );
}
