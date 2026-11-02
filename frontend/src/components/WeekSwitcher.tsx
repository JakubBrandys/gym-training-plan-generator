import { Link } from 'react-router'
import { weekHash } from '../lib/week-hash'

type WeekSwitcherProps = {
  weekCount: number
  current: number
}

export const WeekSwitcher = ({ weekCount, current }: WeekSwitcherProps) => (
  <nav aria-label="Weeks" className="week-switcher">
    {Array.from({ length: weekCount }, (_, index) => index + 1).map((week) => (
      <Link
        key={week}
        to={weekHash(week)}
        replace
        aria-label={`Week ${week}`}
        aria-current={week === current ? 'page' : undefined}
      >
        W{week}
      </Link>
    ))}
  </nav>
)
