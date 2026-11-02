import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { weekHash } from '../lib/week-hash'

type WeekSwitcherProps = {
  weekCount: number
  current: number
}

export const WeekSwitcher = ({ weekCount, current }: WeekSwitcherProps) => {
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const nav = navRef.current
    const link = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !link) return

    nav.scrollLeft = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2
  }, [current])

  return (
    <nav ref={navRef} aria-label="Weeks" className="week-switcher">
      {Array.from({ length: weekCount }, (_, index) => index + 1).map((week) => (
        <Link
          key={week}
          to={weekHash(week)}
          replace
          aria-label={`W${week}, week ${week}`}
          aria-current={week === current ? 'page' : undefined}
        >
          W{week}
        </Link>
      ))}
    </nav>
  )
}
