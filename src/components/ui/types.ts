import type React from 'react'

export type NativeInputChangeEvent = React.ChangeEvent<HTMLInputElement>
export type NativeTextareaChangeEvent = React.ChangeEvent<HTMLTextAreaElement>
export type NativeSelectChangeEvent = React.ChangeEvent<HTMLSelectElement>

export type NativeInputChangeHandler = (event: NativeInputChangeEvent) => void
export type NativeTextareaChangeHandler = (event: NativeTextareaChangeEvent) => void
export type NativeSelectChangeHandler = (event: NativeSelectChangeEvent) => void

export interface InputAdapterProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange?: NativeInputChangeHandler
}

export interface TextareaAdapterProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  onChange?: NativeTextareaChangeHandler
}

export interface SelectAdapterProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  onChange?: NativeSelectChangeHandler
  children?: React.ReactNode
}

export interface ComboboxItem {
  value: string
  label: string
}

export interface ComboboxAdapterProps extends Omit<InputAdapterProps, 'onChange'> {
  items?: readonly ComboboxItem[]
  onChange?: NativeInputChangeHandler
  onSelectionChange?: (value: string) => void
}

export interface CheckboxAdapterProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  onChange?: NativeInputChangeHandler
  label?: React.ReactNode
}

export interface SwitchAdapterProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  onChange?: NativeInputChangeHandler
  label?: React.ReactNode
}

export interface RadioItem {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export interface RadioGroupAdapterProps {
  id?: string
  legend?: React.ReactNode
  name?: string
  value?: string
  onChange?: NativeInputChangeHandler
  options: readonly RadioItem[]
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

export interface SliderAdapterProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number
  onChange?: NativeInputChangeHandler
}

export interface FieldProps {
  id?: string
  label?: React.ReactNode
  helperText?: React.ReactNode
  errorText?: React.ReactNode
  required?: boolean
  className?: string
  labelClassName?: string
  helperClassName?: string
  errorClassName?: string
  children: React.ReactNode
}
