import { forwardRef } from 'react'
import type { SelectAdapterProps } from './types'

export const Select = forwardRef<HTMLSelectElement, SelectAdapterProps>(function Select(props, ref) {
  return <select ref={ref} {...props} />
})

Select.displayName = 'Select'
