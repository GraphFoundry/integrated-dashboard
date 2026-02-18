import { forwardRef } from 'react'
import { TextArea as AriaTextArea } from 'react-aria-components'
import type { TextareaAdapterProps } from './types'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaAdapterProps>(function Textarea(
  { className, onChange, ...props },
  ref
) {
  return <AriaTextArea ref={ref} className={className} onChange={onChange} {...props} />
})

Textarea.displayName = 'Textarea'
