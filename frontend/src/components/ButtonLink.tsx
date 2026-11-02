import { Link, type LinkProps } from 'react-router'
import { buttonClassName, type ButtonVariant } from './button-class'

type ButtonLinkProps = LinkProps & {
  variant?: ButtonVariant
}

export const ButtonLink = ({ variant = 'primary', className, ...rest }: ButtonLinkProps) => (
  <Link {...rest} className={buttonClassName(variant, className)} />
)
