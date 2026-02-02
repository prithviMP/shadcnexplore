import { useState } from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function Logo({ size = "md", className = "" }: LogoProps) {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-16 w-16",
  };

  const rupeeSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-2xl",
  };

  if (imageError) {
    // Fallback: Show rupee symbol with orange gradient background
    return (
      <div
        className={`${sizeClasses[size]} rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg ${className}`}
      >
        <span className={`text-white font-bold ${rupeeSizeClasses[size]}`}>₹</span>
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-xl overflow-hidden shadow-lg bg-transparent flex items-center justify-center ${className}`}>
      <img
        src="/logo.png"
        alt="myBiniyog Valora Logo"
        className="h-full w-full object-contain"
        onError={() => setImageError(true)}
      />
    </div>
  );
}
