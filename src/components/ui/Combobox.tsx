import { ChevronDown } from 'lucide-react'
import { forwardRef, useEffect, useMemo, useState } from 'react'
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
  const { onBlur: _onBlur, onClick, ...inputProps } = props
  const rawValue = value == null ? '' : String(value)
  const selectedItem = useMemo(
    () => items.find((item) => item.value === rawValue) ?? items.find((item) => item.label === rawValue),
    [items, rawValue]
  )
  const [displayValue, setDisplayValue] = useState<string>(selectedItem?.label ?? rawValue)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setDisplayValue(selectedItem?.label ?? rawValue)
  }, [rawValue, selectedItem?.label])

  const filteredItems = useMemo(() => {
    const normalizedQuery = displayValue.trim().toLowerCase()
    const normalizedSelectedLabel = selectedItem?.label.trim().toLowerCase() ?? ''
    if (!normalizedQuery || normalizedQuery === normalizedSelectedLabel) return items
    return items.filter((item) => {
      const label = item.label.toLowerCase()
      const raw = item.value.toLowerCase()
      return label.includes(normalizedQuery) || raw.includes(normalizedQuery)
    })
  }, [displayValue, items, selectedItem?.label])

  const handleInputChange = (nextValue: string) => {
    setDisplayValue(nextValue)

    if (!nextValue.trim() && selectedItem) {
      setDisplayValue(selectedItem.label)
      return
    }

    const matchedItem = items.find((item) => item.label === nextValue)
    const normalizedValue = matchedItem ? matchedItem.value : nextValue.trim()
    onChange?.(createSyntheticInputEvent(normalizedValue, name, id))
  }

  const handleSelectionChange = (nextKey: Key | null) => {
    if (nextKey == null) {
      return
    }

    const nextValue = String(nextKey)
    const nextItem = items.find((item) => item.value === nextValue)

    setDisplayValue(nextItem?.label ?? nextValue)
    onSelectionChange?.(nextValue)
    onChange?.(createSyntheticInputEvent(nextValue, name, id))
  }

  return (
    <AriaComboBox
      className="block w-full"
      allowsCustomValue
      inputValue={displayValue}
      isDisabled={disabled}
      isRequired={required}
      items={filteredItems}
      menuTrigger="focus"
      selectedKey={selectedItem?.value}
      onInputChange={handleInputChange}
      onOpenChange={setIsOpen}
      onSelectionChange={handleSelectionChange}
    >
      <div className="relative w-full">
        <AriaInput
          ref={ref}
          id={id}
          className={cn(
            controlInputMutedClass,
            'cursor-pointer focus:cursor-text',
            !isOpen && 'caret-transparent',
            className
          )}
          name={name}
          readOnly={!isOpen}
          onClick={(event) => {
            if (!isOpen && document.activeElement === event.currentTarget) {
              event.currentTarget.blur()
              requestAnimationFrame(() => {
                event.currentTarget.focus()
              })
            }
            onClick?.(event)
          }}
          {...inputProps}
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
          'surface-panel z-50 max-h-72 w-[var(--trigger-width)] min-w-[var(--trigger-width)] overflow-auto rounded-[var(--radius-sm)] border border-[var(--border)] p-1',
          'shadow-[0_20px_40px_rgba(2,8,23,0.3)]'
        )}
      >
        <ListBox className="w-full outline-none">
          {filteredItems.map((item) => (
            <ListBoxItem
              key={item.value}
              id={item.value}
              textValue={item.label}
              className={({ isFocused, isSelected }) =>
                cn(
                  'cursor-pointer rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] outline-none',
                  isFocused && 'bg-[var(--surface-soft)] text-[var(--text-primary)]',
                  isSelected && 'bg-[var(--surface-soft)] text-[var(--text-primary)]'
                )
              }
            >
              {item.label}
            </ListBoxItem>
          ))}
          {filteredItems.length === 0 && (
            <div className="px-3 py-2 text-sm text-[var(--text-muted)]">No matches</div>
          )}
        </ListBox>
      </Popover>
    </AriaComboBox>
  )
})

Combobox.displayName = 'Combobox'
