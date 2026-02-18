import { forwardRef } from 'react'
import type { SwitchAdapterProps } from './types'

export const Switch = forwardRef<HTMLInputElement, SwitchAdapterProps>(function Switch(props, ref) {
  return <input ref={ref} role="switch" type="checkbox" {...props} />
})

Switch.displayName = 'Switch'
