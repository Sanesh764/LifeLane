import React from 'react';

export function Card({
  children,
  variant = 'ivory', // 'ivory', 'graphite', 'elevated', 'border-only'
  title = null,
  subtitle = null,
  headerAction = null,
  footer = null,
  className = '',
  accent = null, // 'amber', 'mint', 'red', null
  ...props
}) {
  const variantClass = `card--${variant}`;
  const accentClass = accent ? `card--accent-${accent}` : '';

  return (
    <div className={`card ${variantClass} ${accentClass} ${className}`} {...props}>
      {(title || subtitle || headerAction) && (
        <div className="card__header">
          <div>
            {title && <h3 className="card__title">{title}</h3>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {headerAction && <div className="card__action">{headerAction}</div>}
        </div>
      )}
      <div className="card__body">{children}</div>
      {footer && <div className="card__footer">{footer}</div>}
    </div>
  );
}
