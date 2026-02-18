import { forwardRef } from 'react'
import type { TextareaAdapterProps } from './types'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaAdapterProps>(function Textarea(props, ref) {
  return <textarea ref={ref} {...props} />
})

Textarea.displayName = 'Textarea'
