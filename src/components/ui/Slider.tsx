import { forwardRef } from 'react'
import { Slider as AriaSlider, SliderThumb, SliderTrack } from 'react-aria-components'
import { cn } from '@/components/common/uiClassTokens'
import type { NativeInputChangeEvent, SliderAdapterProps } from './types'

export const Slider = forwardRef<HTMLInputElement, SliderAdapterProps>(function Slider(
  { className, disabled, id, max, min, name, onChange, step, value, ...ariaProps },
  ref
) {
  const minValue = typeof min === 'number' ? min : Number(min ?? 0)
  const maxValue = typeof max === 'number' ? max : Number(max ?? 100)
  const stepValue = typeof step === 'number' ? step : step ? Number(step) : 1

  const createSyntheticRangeEvent = (nextValue: number): NativeInputChangeEvent => {
    const target = {
      value: String(nextValue),
      name: name ?? '',
      id: id ?? '',
    } as HTMLInputElement

    return {
      target,
      currentTarget: target,
    } as NativeInputChangeEvent
  }

  return (
    <>
      <input
        ref={ref}
        aria-hidden="true"
        className="sr-only"
        disabled={disabled}
        max={max}
        min={min}
        name={name}
        step={step}
        tabIndex={-1}
        type="range"
        value={value}
        onChange={() => {
          // Hidden sync element for form/ref compatibility.
        }}
      />
      <AriaSlider
        aria-describedby={ariaProps['aria-describedby']}
        aria-invalid={ariaProps['aria-invalid']}
        aria-label={ariaProps['aria-label']}
        aria-labelledby={ariaProps['aria-labelledby']}
        id={id}
        isDisabled={disabled}
        maxValue={maxValue}
        minValue={minValue}
        step={stepValue}
        value={value}
        onChange={(nextValue) => onChange?.(createSyntheticRangeEvent(nextValue))}
        className={cn('w-full', className)}
      >
        <SliderTrack className="relative h-2 w-full rounded-full bg-white/15">
          {({ state }) => (
            <>
              <div
                className="absolute h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                style={{ width: state.getThumbPercent(0) * 100 + '%' }}
              />
              <SliderThumb className="top-1/2 h-4 w-4 rounded-full border border-cyan-200 bg-cyan-100 shadow-[var(--shadow-neon)] outline-none -translate-y-1/2" />
            </>
          )}
        </SliderTrack>
      </AriaSlider>
    </>
  )
})

Slider.displayName = 'Slider'
