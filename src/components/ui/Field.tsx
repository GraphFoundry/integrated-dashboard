import type { FieldProps } from './types'

export function Field({
  id,
  label,
  helperText,
  errorText,
  required,
  className,
  labelClassName,
  helperClassName,
  errorClassName,
  children,
}: FieldProps) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className={labelClassName}>
          {label}
          {required ? ' *' : null}
        </label>
      )}
      {children}
      {helperText && <p className={helperClassName}>{helperText}</p>}
      {errorText && <p className={errorClassName}>{errorText}</p>}
    </div>
  )
}
