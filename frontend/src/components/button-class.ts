export type ButtonVariant = 'primary' | 'secondary' | 'danger'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
}

export const buttonClassName = (variant: ButtonVariant, className?: string) =>
  ['btn', VARIANT_CLASSES[variant], className].filter(Boolean).join(' ')
