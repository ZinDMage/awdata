import React from "react";

const Badge = ({ children, className = "", variant = "secondary" }) => {
  const variants = {
    default: "bg-info text-white",
    secondary: "bg-surface-secondary text-content-secondary",
    outline: "border border-border-subtle text-content-tertiary",
    destructive: "bg-negative text-white",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variants[variant] || variants.secondary} ${className}`}>
      {children}
    </span>
  );
};

const Button = ({ children, className = "", variant = "default", size = "default", ...props }) => {
  const variants = {
    default: "bg-info text-white hover:bg-info/90",
    destructive: "bg-negative text-white hover:bg-negative/90",
    outline: "border border-border-subtle bg-transparent hover:bg-surface-tertiary text-content-primary",
    secondary: "bg-surface-secondary text-content-primary hover:bg-surface-tertiary",
    ghost: "hover:bg-surface-tertiary text-content-secondary hover:text-content-primary",
    link: "text-info underline-offset-4 hover:underline",
  };

  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({ className = "", ...props }) => {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-border-subtle bg-surface-tertiary px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-content-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
};

export { Badge, Button, Input };
