import { forwardRef } from 'react'
import type { ComboboxAdapterProps } from './types'

export const Combobox = forwardRef<HTMLInputElement, ComboboxAdapterProps>(function Combobox(
  { id, items, onSelectionChange, onChange, ...props },
  ref
) {
  const listId = id && items && items.length > 0 ? `${id}-listbox` : props.list

  const handleChange: ComboboxAdapterProps['onChange'] = (event) => {
    onChange?.(event)
    onSelectionChange?.(event.target.value)
  }

  return (
    <>
      <input ref={ref} id={id} list={listId} onChange={handleChange} {...props} />
      {id && items && items.length > 0 && (
        <datalist id={`${id}-listbox`}>
          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </datalist>
      )}
    </>
  )
})

Combobox.displayName = 'Combobox'
