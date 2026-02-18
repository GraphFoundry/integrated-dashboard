import { forwardRef } from 'react'
import type { CheckboxAdapterProps } from './types'

export const Checkbox = forwardRef<HTMLInputElement, CheckboxAdapterProps>(function Checkbox(props, ref) {
  return <input ref={ref} type="checkbox" {...props} />
})

Checkbox.displayName = 'Checkbox'
