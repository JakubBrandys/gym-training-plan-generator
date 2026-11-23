export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'link'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  link: 'btn-link',
}

export const buttonClassName = (variant: ButtonVariant, className?: string) =>
  ['btn', VARIANT_CLASSES[variant], className].filter(Boolean).join(' ')
