import type { ReactNode } from 'react'

type ChipProps = {
  children: ReactNode
}

export const Chip = ({ children }: ChipProps) => <span className="chip">{children}</span>
