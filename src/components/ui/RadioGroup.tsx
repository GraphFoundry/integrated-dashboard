import { cn } from '@/components/common/uiClassTokens'
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from 'react-aria-components'
import type { NativeInputChangeEvent, RadioGroupAdapterProps } from './types'

function createSyntheticRadioEvent(value: string, name?: string): NativeInputChangeEvent {
  const target = {
    value,
    name: name ?? '',
  } as HTMLInputElement

  return {
    target,
    currentTarget: target,
  } as NativeInputChangeEvent
}

export function RadioGroup({
  id,
  legend,
  name,
  value,
  onChange,
  options,
  disabled,
  className,
  ...ariaProps
}: RadioGroupAdapterProps) {
  return (
    <AriaRadioGroup
      id={id}
      isDisabled={disabled}
      name={name}
      value={value}
      onChange={(nextValue) => onChange?.(createSyntheticRadioEvent(nextValue, name))}
      {...ariaProps}
      className={cn('space-y-2', className)}
    >
      {legend ? <span className="text-sm font-semibold text-[var(--text-secondary)]">{legend}</span> : null}
      {options.map((option) => (
        <AriaRadio
          key={option.value}
          isDisabled={option.disabled}
          value={option.value}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1 text-sm text-[var(--text-secondary)] outline-none',
            'focus-visible:shadow-[var(--shadow-neon)]'
          )}
        >
          {({ isSelected }) => (
            <>
              <span
                className={cn(
                  'h-4 w-4 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] p-0.5',
                  isSelected && 'border-[var(--color-emerald-300)]/50 bg-emerald-500/20'
                )}
              >
                <span
                  className={cn(
                    'block h-full w-full rounded-full bg-transparent',
                    isSelected && 'bg-[var(--color-emerald-300)]'
                  )}
                />
              </span>
              <span>{option.label}</span>
            </>
          )}
        </AriaRadio>
      ))}
    </AriaRadioGroup>
  )
}
