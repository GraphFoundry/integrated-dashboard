import { forwardRef } from 'react'
import type { InputAdapterProps } from './types'

export const Input = forwardRef<HTMLInputElement, InputAdapterProps>(function Input(props, ref) {
  return <input ref={ref} {...props} />
})

Input.displayName = 'Input'
