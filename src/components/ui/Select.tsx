import { ChevronDown } from 'lucide-react'
import React, { forwardRef } from 'react'
import type { Key } from 'react-aria-components'
import {
  Button,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
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
  { className, children, disabled, id, name, onChange, required, value, ...restProps },
  ref
) {
  const ariaLabel = restProps['aria-label']
  const ariaLabelledBy = restProps['aria-labelledby']
  const ariaDescribedBy = restProps['aria-describedby']
  const ariaInvalid = restProps['aria-invalid']
  const autoFocus = restProps.autoFocus
  const options = parseOptions(children)
  const selectedValue = value == null ? '' : String(value)
  const selectedOption = options.find((option) => option.value === selectedValue)
  const selectedKey = selectedOption?.key

  const handleSelectionChange = (nextKey: Key | null) => {
    if (!onChange) {
      return
    }
    const option = options.find((item) => item.key === String(nextKey))
    const nextValue = option?.value ?? ''
    onChange(createSyntheticSelectEvent(nextValue, name, id))
  }

  return (
    <>
      <select
        ref={ref}
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
      <AriaSelect
        isDisabled={disabled}
        isInvalid={Boolean(ariaInvalid)}
        isRequired={required}
        selectedKey={selectedKey}
        onSelectionChange={handleSelectionChange}
      >
        <Button
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          autoFocus={autoFocus}
          className={cn(controlInputMutedClass, 'appearance-none pr-11 text-left', className)}
        >
          <SelectValue />
          <ChevronDown aria-hidden className="h-4 w-4 text-[var(--text-muted)]" />
        </Button>
        <Popover
          className={cn(
            'surface-panel z-50 max-h-72 overflow-auto rounded-[var(--radius-sm)] border border-white/14 p-1',
            'shadow-[0_20px_40px_rgba(2,8,23,0.45)]'
          )}
        >
          <ListBox className="outline-none">
            {options.map((option) => (
              <ListBoxItem
                key={option.key}
                id={option.key}
                isDisabled={option.disabled}
                textValue={option.textValue}
                className={({ isFocused, isSelected }) =>
                  cn(
                    'cursor-default rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] outline-none',
                    isFocused && 'bg-white/10 text-[var(--text-primary)]',
                    isSelected && 'bg-cyan-500/20 text-cyan-100'
                  )
                }
              >
                {option.label}
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </AriaSelect>
    </>
  )
})

Select.displayName = 'Select'
