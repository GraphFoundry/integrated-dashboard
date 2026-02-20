import { Check } from 'lucide-react'
import { forwardRef } from 'react'
import { Checkbox as AriaCheckbox } from 'react-aria-components'
import { cn } from '@/components/common/uiClassTokens'
import type { CheckboxAdapterProps, NativeInputChangeEvent } from './types'

function createSyntheticCheckedEvent(
  checked: boolean,
  name?: string,
  id?: string,
  value?: string
): NativeInputChangeEvent {
  const target = {
    checked,
    value: value ?? 'on',
    name: name ?? '',
    id: id ?? '',
  } as HTMLInputElement

  return {
    target,
    currentTarget: target,
  } as NativeInputChangeEvent
}

function normalizeInputValue(
  value: CheckboxAdapterProps['value']
): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value[0]
  }
  return undefined
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxAdapterProps>(function Checkbox(
  { checked, className, disabled, id, label, name, onChange, required, value, ...ariaProps },
  ref
) {
  const isSelected = Boolean(checked)
  const normalizedValue = normalizeInputValue(value)

  return (
    <>
      <input
        ref={ref}
        aria-hidden="true"
        checked={isSelected}
        className="sr-only"
        disabled={disabled}
        name={name}
        tabIndex={-1}
        type="checkbox"
        value={normalizedValue}
        onChange={() => {
          // Hidden sync element for form/ref compatibility.
        }}
      />
      <AriaCheckbox
        aria-describedby={ariaProps['aria-describedby']}
        aria-invalid={ariaProps['aria-invalid']}
        aria-label={ariaProps['aria-label']}
        aria-labelledby={ariaProps['aria-labelledby']}
        autoFocus={ariaProps.autoFocus}
        id={id}
        isDisabled={disabled}
        isRequired={required}
        isSelected={isSelected}
        onChange={(nextChecked) =>
          onChange?.(createSyntheticCheckedEvent(nextChecked, name, id, normalizedValue))
        }
        className={cn('inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]', className)}
      >
        {({ isDisabled, isFocusVisible, isSelected }) => (
          <>
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-subtle)]',
                isSelected && 'border-[var(--ring)] bg-emerald-500/20 text-[var(--text-primary)]',
                isFocusVisible && 'shadow-[var(--shadow-neon)]',
                isDisabled && 'opacity-60'
              )}
            >
              {isSelected && <Check aria-hidden className="h-3.5 w-3.5" />}
            </span>
            {label ? <span>{label}</span> : null}
          </>
        )}
      </AriaCheckbox>
    </>
  )
})

Checkbox.displayName = 'Checkbox'
