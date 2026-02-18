import { ChevronDown } from 'lucide-react'
import { forwardRef } from 'react'
import type { Key } from 'react-aria-components'
import {
  Button,
  ComboBox as AriaComboBox,
  Input as AriaInput,
  ListBox,
  ListBoxItem,
  Popover,
} from 'react-aria-components'
import { cn, controlInputMutedClass } from '@/components/common/uiClassTokens'
import type { ComboboxAdapterProps, NativeInputChangeEvent } from './types'

function createSyntheticInputEvent(
  value: string,
  name?: string,
  id?: string
): NativeInputChangeEvent {
  const target = {
    value,
    name: name ?? '',
    id: id ?? '',
  } as HTMLInputElement

  return {
    target,
    currentTarget: target,
  } as NativeInputChangeEvent
}

export const Combobox = forwardRef<HTMLInputElement, ComboboxAdapterProps>(function Combobox(
  {
    className,
    disabled,
    id,
    items = [],
    name,
    onChange,
    onSelectionChange,
    required,
    value,
    ...props
  },
  ref
) {
  const inputValue = value == null ? '' : String(value)

  const handleInputChange = (nextValue: string) => {
    onChange?.(createSyntheticInputEvent(nextValue, name, id))
  }

  const handleSelectionChange = (nextKey: Key | null) => {
    const nextValue = nextKey == null ? '' : String(nextKey)
    onSelectionChange?.(nextValue)
    onChange?.(createSyntheticInputEvent(nextValue, name, id))
  }

  return (
    <AriaComboBox
      className="block w-full"
      allowsCustomValue
      inputValue={inputValue}
      isDisabled={disabled}
      isRequired={required}
      items={items}
      onInputChange={handleInputChange}
      onSelectionChange={handleSelectionChange}
    >
      <div className="relative w-full">
        <AriaInput
          ref={ref}
          id={id}
          className={cn(controlInputMutedClass, className)}
          name={name}
          {...props}
        />
        <Button
          aria-label="Toggle suggestions"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        >
          <ChevronDown aria-hidden className="h-4 w-4" />
        </Button>
      </div>
      <Popover
        className={cn(
          'surface-panel z-50 max-h-72 overflow-auto rounded-[var(--radius-sm)] border border-white/14 p-1',
          'shadow-[0_20px_40px_rgba(2,8,23,0.45)]'
        )}
      >
        <ListBox className="outline-none">
          {items.map((item) => (
            <ListBoxItem
              key={item.value}
              id={item.value}
              textValue={item.label}
              className={({ isFocused, isSelected }) =>
                cn(
                  'cursor-default rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] outline-none',
                  isFocused && 'bg-white/10 text-[var(--text-primary)]',
                  isSelected && 'bg-cyan-500/20 text-cyan-100'
                )
              }
            >
              {item.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </AriaComboBox>
  )
})

Combobox.displayName = 'Combobox'
