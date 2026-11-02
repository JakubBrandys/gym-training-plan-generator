export type ButtonVariant = 'primary' | 'secondary'

export const buttonClassName = (variant: ButtonVariant, className?: string) =>
  ['btn', variant === 'secondary' ? 'btn-secondary' : '', className].filter(Boolean).join(' ')
