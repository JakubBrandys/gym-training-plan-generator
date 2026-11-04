import type { ComponentProps } from 'react'
import { buttonClassName, type ButtonVariant } from './button-class'

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant
}

export const Button = ({ variant = 'primary', type = 'button', className, ...rest }: ButtonProps) => (
  <button {...rest} type={type} className={buttonClassName(variant, className)} />
)
