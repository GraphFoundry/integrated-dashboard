import { forwardRef } from 'react'
import { Switch as AriaSwitch } from 'react-aria-components'
import { cn } from '@/components/common/uiClassTokens'
import type { NativeInputChangeEvent, SwitchAdapterProps } from './types'

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

function normalizeInputValue(value: SwitchAdapterProps['value']): string | undefined {
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

export const Switch = forwardRef<HTMLInputElement, SwitchAdapterProps>(function Switch(
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
        required={required}
        tabIndex={-1}
        type="checkbox"
        value={normalizedValue}
        onChange={() => {
          // Hidden sync element for form/ref compatibility.
        }}
      />
      <AriaSwitch
        aria-describedby={ariaProps['aria-describedby']}
        aria-invalid={ariaProps['aria-invalid']}
        aria-label={ariaProps['aria-label']}
        aria-labelledby={ariaProps['aria-labelledby']}
        autoFocus={ariaProps.autoFocus}
        id={id}
        isDisabled={disabled}
        isSelected={isSelected}
        onChange={(nextChecked) =>
          onChange?.(createSyntheticCheckedEvent(nextChecked, name, id, normalizedValue))
        }
        className={cn('inline-flex items-center gap-3 text-sm text-[var(--text-secondary)]', className)}
      >
        {({ isDisabled, isFocusVisible, isSelected }) => (
          <>
            <span
              className={cn(
                'relative flex h-6 w-11 items-center rounded-full border border-[var(--border)] bg-[var(--surface-soft)] p-0.5',
                isSelected && 'border-cyan-300/35 bg-cyan-500/30',
                isFocusVisible && 'shadow-[var(--shadow-neon)]',
                isDisabled && 'opacity-60'
              )}
            >
              <span
                className={cn(
                  'h-5 w-5 rounded-full bg-[var(--surface-contrast)] transition-transform',
                  isSelected && 'translate-x-5'
                )}
              />
            </span>
            {label ? <span>{label}</span> : null}
          </>
        )}
      </AriaSwitch>
    </>
  )
})

Switch.displayName = 'Switch'
