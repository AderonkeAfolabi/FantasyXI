import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs rounded-md gap-1.5",
    md: "px-4 py-2.5 text-sm rounded-lg gap-2 font-semibold",
    lg: "px-6 py-3 text-base rounded-xl gap-2.5 font-bold",
  };

  const variantClasses = {
    primary:
      "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm hover:shadow active:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-400/50",
    secondary:
      "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 active:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-500/50",
    outline:
      "border border-slate-700 hover:border-slate-600 hover:bg-slate-800/60 text-slate-200 active:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-500/50",
    ghost:
      "text-slate-300 hover:text-white hover:bg-slate-800/70 active:bg-slate-800/90",
    danger:
      "bg-rose-600 hover:bg-rose-500 text-white active:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-400/50",
  };

  return (
    <button
      className={`inline-flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none outline-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
};
