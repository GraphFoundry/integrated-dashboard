import { ChevronDown } from 'lucide-react'
import React, { forwardRef, useEffect, useMemo, useState } from 'react'
import type { Key } from 'react-aria-components'
import {
  ComboBox as AriaComboBox,
  Input as AriaInput,
  Button,
  ListBox,
  ListBoxItem,
  Popover,
} from 'react-aria-components'
import { cn, controlInputMutedClass } from '@/components/common/uiClassTokens'
import type { NativeSelectChangeEvent, SelectAdapterProps } from './types'

interface ParsedOption {
  key: string
  value: string
  label: React.ReactNode
  textValue: string
  disabled: boolean
}

function toTextValue(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(toTextValue).join(' ').trim()
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>
    return toTextValue(element.props.children)
  }
  return ''
}

function parseOptions(children: React.ReactNode): ParsedOption[] {
  const options: ParsedOption[] = []

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      return
    }

    if (child.type === 'option') {
      const optionElement = child as React.ReactElement<{
        value?: string | number
        children?: React.ReactNode
        disabled?: boolean
      }>
      const rawValue = optionElement.props.value ?? optionElement.props.children
      const value = rawValue == null ? '' : String(rawValue)
      const label = optionElement.props.children
      const textValue = toTextValue(label) || value
      options.push({
        key: value === '' ? `__empty__${options.length}` : value,
        value,
        label,
        textValue,
        disabled: Boolean(optionElement.props.disabled),
      })
      return
    }

    const withChildren = child as React.ReactElement<{ children?: React.ReactNode }>
    if (withChildren.props?.children) {
      options.push(...parseOptions(withChildren.props.children))
    }
  })

  return options
}

function createSyntheticSelectEvent(
  value: string,
  name?: string,
  id?: string
): NativeSelectChangeEvent {
  const target = {
    value,
    name: name ?? '',
    id: id ?? '',
  } as HTMLSelectElement

  return {
    target,
    currentTarget: target,
  } as NativeSelectChangeEvent
}

export const Select = forwardRef<HTMLSelectElement, SelectAdapterProps>(function Select(
  { className, children, disabled, id, name, onChange, required, suffixIcon, value, ...restProps },
  ref
) {
  const ariaLabel = restProps['aria-label']
  const ariaLabelledBy = restProps['aria-labelledby']
  const ariaDescribedBy = restProps['aria-describedby']
  const ariaInvalid = restProps['aria-invalid']
  const autoFocus = restProps.autoFocus
  const fallbackAriaLabel =
    ariaLabel ??
    (ariaLabelledBy ? undefined : name?.trim() || (id ? `${id} select` : 'Select option'))
  const options = parseOptions(children)
  const selectedValue = value == null ? '' : String(value)
  const selectedOption = options.find((option) => option.value === selectedValue)
  const selectedKey = selectedOption?.key
  const [query, setQuery] = useState(selectedOption?.textValue ?? '')

  useEffect(() => {
    setQuery(selectedOption?.textValue ?? '')
  }, [selectedOption?.textValue])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const selectedLabel = selectedOption?.textValue.trim().toLowerCase() ?? ''
    if (selectedLabel && normalizedQuery === selectedLabel) return options
    if (!normalizedQuery) return options
    return options.filter((option) => {
      const label = option.textValue.toLowerCase()
      const rawValue = option.value.toLowerCase()
      return label.includes(normalizedQuery) || rawValue.includes(normalizedQuery)
    })
  }, [options, query])

  const emitChange = (nextValue: string) => {
    if (!onChange) return
    onChange(createSyntheticSelectEvent(nextValue, name, id))
  }

  const handleSelectionChange = (nextKey: Key | null) => {
    if (nextKey == null) {
      return
    }

    const option = options.find((item) => item.key === String(nextKey))
    const nextValue = option?.value ?? ''
    setQuery(option?.textValue ?? '')
    emitChange(nextValue)
  }

  const handleInputChange = (nextQuery: string) => {
    setQuery(nextQuery)
    if (!nextQuery.trim() && selectedValue) {
      const emptyOption = options.find((option) => option.value === '')
      if (emptyOption) {
        emitChange('')
      }
    }
  }

  const handleInputBlur = () => {
    setQuery(selectedOption?.textValue ?? '')
  }

  return (
    <>
      <select
        ref={ref}
        id={id}
        aria-hidden="true"
        className="sr-only"
        disabled={disabled}
        name={name}
        tabIndex={-1}
        value={selectedValue}
        onChange={() => {
          // Hidden sync element for form/ref compatibility.
        }}
      >
        {options.map((option) => (
          <option key={option.key} value={option.value} disabled={option.disabled}>
            {option.textValue}
          </option>
        ))}
      </select>
      <AriaComboBox
        className="block w-full"
        allowsCustomValue={false}
        aria-describedby={ariaDescribedBy}
        aria-label={fallbackAriaLabel}
        aria-labelledby={ariaLabelledBy}
        isDisabled={disabled}
        isInvalid={Boolean(ariaInvalid)}
        isRequired={required}
        inputValue={query}
        menuTrigger="focus"
        selectedKey={selectedKey}
        onInputChange={handleInputChange}
        onSelectionChange={handleSelectionChange}
      >
        <div className="relative w-full">
          <AriaInput
            id={id}
            aria-invalid={ariaInvalid}
            aria-label={fallbackAriaLabel}
            aria-labelledby={ariaLabelledBy}
            autoFocus={autoFocus}
            className={cn(controlInputMutedClass, 'w-full cursor-pointer pr-12', className)}
            name={name}
            onBlur={handleInputBlur}
          />
          <Button
            aria-label="Toggle options"
            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[var(--text-muted)]"
          >
            {suffixIcon ? <span className="text-[var(--text-secondary)]">{suffixIcon}</span> : null}
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Button>
        </div>
        <Popover
          className={cn(
            'surface-panel z-50 max-h-72 w-[var(--trigger-width)] min-w-[var(--trigger-width)] overflow-auto rounded-[var(--radius-sm)] border border-[var(--border)] p-1',
            'shadow-[0_20px_40px_rgba(2,8,23,0.3)]'
          )}
        >
          <ListBox className="w-full outline-none">
            {filteredOptions.map((option) => (
              <ListBoxItem
                key={option.key}
                id={option.key}
                isDisabled={option.disabled}
                textValue={option.textValue}
                className={({ isFocused, isSelected }) =>
                  cn(
                    'cursor-pointer rounded-md border border-transparent px-3 py-2 text-sm text-[var(--text-secondary)] outline-none',
                    isFocused && 'bg-[var(--surface-soft)] text-[var(--text-primary)]',
                    isSelected && 'border-[var(--ring)] bg-[var(--surface-soft)] text-[var(--text-primary)]'
                  )
                }
              >
                {option.label}
              </ListBoxItem>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-[var(--text-muted)]">No matches</div>
            )}
          </ListBox>
        </Popover>
      </AriaComboBox>
    </>
  )
})

Select.displayName = 'Select'
