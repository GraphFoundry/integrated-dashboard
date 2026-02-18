import { forwardRef } from 'react'
import { Input as AriaInput } from 'react-aria-components'
import type { InputAdapterProps } from './types'

export const Input = forwardRef<HTMLInputElement, InputAdapterProps>(function Input(
  { className, onChange, ...props },
  ref
) {
  return <AriaInput ref={ref} className={className} onChange={onChange} {...props} />
})

Input.displayName = 'Input'
