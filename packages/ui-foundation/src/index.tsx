import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

type SurfaceElement = "article" | "div" | "main" | "section";

export interface SurfaceProps {
  readonly as?: SurfaceElement;
  readonly children: ReactNode;
  readonly className?: string;
  readonly labelledBy?: string;
}

export function Surface({
  as: Element = "section",
  children,
  className,
  labelledBy,
}: SurfaceProps) {
  const classes = ["wlbp-surface", className].filter(Boolean).join(" ");

  return (
    <Element aria-labelledby={labelledBy} className={classes}>
      {children}
    </Element>
  );
}

export type BadgeTone = "neutral" | "positive" | "warning" | "danger";

export interface BadgeProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: BadgeTone;
}

export function Badge({ children, className, tone = "neutral" }: BadgeProps) {
  const classes = ["wlbp-badge", `wlbp-badge--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return <span className={classes}>{children}</span>;
}

export interface VisuallyHiddenProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function VisuallyHidden({ children, className }: VisuallyHiddenProps) {
  const classes = ["wlbp-visually-hidden", className].filter(Boolean).join(" ");

  return <span className={classes}>{children}</span>;
}

export interface ButtonProps extends Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "aria-controls"
  | "aria-describedby"
  | "aria-expanded"
  | "aria-label"
  | "aria-pressed"
  | "disabled"
  | "form"
  | "name"
  | "onClick"
  | "type"
  | "value"
> {
  readonly children: ReactNode;
  readonly className?: string;
  readonly loading?: boolean;
  readonly loadingLabel?: string;
  readonly variant?: "primary" | "secondary" | "quiet";
}

export function Button({
  children,
  className,
  disabled = false,
  loading = false,
  loadingLabel,
  type = "button",
  variant = "primary",
  ...buttonProps
}: ButtonProps) {
  const classes = ["wlbp-button", `wlbp-button--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...buttonProps}
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled || loading}
      type={type}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

export interface TextFieldProps extends Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "autoComplete"
  | "defaultValue"
  | "disabled"
  | "inputMode"
  | "maxLength"
  | "minLength"
  | "name"
  | "onChange"
  | "placeholder"
  | "required"
  | "type"
  | "value"
> {
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly id: string;
  readonly label: ReactNode;
}

export function TextField({
  description,
  error,
  id,
  label,
  required = false,
  ...inputProps
}: TextFieldProps) {
  const descriptionId = description === undefined ? undefined : `${id}-description`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="wlbp-field">
      <label className="wlbp-field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {description === undefined ? null : (
        <p className="wlbp-field__description" id={descriptionId}>
          {description}
        </p>
      )}
      <input
        {...inputProps}
        aria-describedby={describedBy}
        aria-invalid={error === undefined ? undefined : true}
        className="wlbp-field__input"
        id={id}
        required={required}
      />
      {error === undefined ? null : (
        <p className="wlbp-field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export interface ErrorSummaryProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly focusTarget?: boolean;
  readonly id?: string;
  readonly title: ReactNode;
}

export function ErrorSummary({
  children,
  className,
  focusTarget = false,
  id,
  title,
}: ErrorSummaryProps) {
  const classes = ["wlbp-error-summary", className].filter(Boolean).join(" ");

  return (
    <div
      aria-atomic="true"
      aria-live="assertive"
      className={classes}
      id={id}
      role="alert"
      tabIndex={focusTarget ? -1 : undefined}
    >
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export interface StatusMessageProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: "neutral" | "positive" | "warning";
}

export function StatusMessage({
  children,
  className,
  tone = "neutral",
}: StatusMessageProps) {
  const classes = ["wlbp-status", `wlbp-status--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <p aria-atomic="true" aria-live="polite" className={classes} role="status">
      {children}
    </p>
  );
}

export interface LinkButtonProps extends Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "aria-current" | "aria-label" | "download" | "hrefLang" | "rel" | "target"
> {
  readonly children: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly href: string;
  readonly variant?: "primary" | "secondary" | "quiet";
}

export function LinkButton({
  children,
  className,
  disabled = false,
  href,
  variant = "primary",
  ...anchorProps
}: LinkButtonProps) {
  const classes = ["wlbp-link-button", `wlbp-link-button--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <a
      {...anchorProps}
      aria-disabled={disabled || undefined}
      className={classes}
      href={disabled ? undefined : href}
      tabIndex={disabled ? -1 : undefined}
    >
      {children}
    </a>
  );
}
