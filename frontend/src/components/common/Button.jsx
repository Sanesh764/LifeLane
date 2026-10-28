import React from 'react';

/**
 * Button component supporting primary, secondary, critical, outline, and ghost variants.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon = null,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  className = '',
  fullWidth = false,
  ...props
}) {
  const variantClass = `btn--${variant}`;
  const sizeClass = `btn--${size}`;
  const widthClass = fullWidth ? 'btn--full' : '';

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${widthClass} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <span className="btn__spinner" aria-hidden="true" />
      ) : Icon && iconPosition === 'left' ? (
        <span className="btn__icon btn__icon--left"><Icon size={size === 'lg' ? 22 : size === 'sm' ? 16 : 18} /></span>
      ) : null}
      
      <span className="btn__label">{children}</span>

      {!loading && Icon && iconPosition === 'right' ? (
        <span className="btn__icon btn__icon--right"><Icon size={size === 'lg' ? 22 : size === 'sm' ? 16 : 18} /></span>
      ) : null}
    </button>
  );
}
