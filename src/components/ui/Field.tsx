import React from 'react'
import { cn, controlLabelClass } from '@/components/common/uiClassTokens'
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
  const helperId = helperText && id ? `${id}-helper` : undefined
  const errorId = errorText && id ? `${id}-error` : undefined
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined

  const childWithA11y = (() => {
    if (!React.isValidElement(children)) {
      return children
    }

    const element = children as React.ReactElement<{
      id?: string
      'aria-describedby'?: string
      'aria-invalid'?: boolean
    }>

    return React.cloneElement(element, {
      ...(id && !element.props.id ? { id } : {}),
      ...(describedBy
        ? {
          'aria-describedby': [element.props['aria-describedby'], describedBy]
            .filter(Boolean)
            .join(' '),
        }
        : {}),
      ...(errorText != null
        ? {
          'aria-invalid':
              element.props['aria-invalid'] === undefined ? true : element.props['aria-invalid'],
        }
        : {}),
    })
  })()

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className={cn(controlLabelClass, labelClassName)}>
          {label}
          {required ? ' *' : null}
        </label>
      )}
      {childWithA11y}
      {helperText && (
        <p id={helperId} className={cn('text-xs text-[var(--text-muted)]', helperClassName)}>
          {helperText}
        </p>
      )}
      {errorText && (
        <p id={errorId} className={cn('text-xs text-[var(--color-error)]', errorClassName)}>
          {errorText}
        </p>
      )}
    </div>
  )
}
