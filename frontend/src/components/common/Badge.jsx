import React from 'react';

/**
 * Status Badge / Chip component following Signal & Motion design tokens.
 * Variants: clear, warning, critical, neutral, driver, info
 */
export function Badge({
  children,
  variant = 'neutral',
  pulse = false,
  className = '',
  size = 'md',
}) {
  const variantClass = `badge--${variant}`;
  const sizeClass = `badge--${size}`;
  const pulseClass = pulse ? 'badge--pulse' : '';

  return (
    <span className={`badge ${variantClass} ${sizeClass} ${pulseClass} ${className}`}>
      {pulse && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
