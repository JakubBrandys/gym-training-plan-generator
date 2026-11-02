import type { HTMLAttributes } from 'react'

export const Card = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div {...rest} className={className ? `card ${className}` : 'card'} />
)
