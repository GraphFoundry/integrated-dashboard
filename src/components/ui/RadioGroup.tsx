import type { RadioGroupAdapterProps } from './types'

export function RadioGroup({
  name,
  value,
  onChange,
  options,
  disabled,
  className,
  ...ariaProps
}: RadioGroupAdapterProps) {
  return (
    <fieldset className={className} disabled={disabled} {...ariaProps}>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled || option.disabled}
            onChange={onChange}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  )
}
