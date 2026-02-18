import { forwardRef } from 'react'
import type { SliderAdapterProps } from './types'

export const Slider = forwardRef<HTMLInputElement, SliderAdapterProps>(function Slider(
  { value, onChange, ...props },
  ref
) {
  return <input ref={ref} type="range" value={value} onChange={onChange} {...props} />
})

Slider.displayName = 'Slider'
