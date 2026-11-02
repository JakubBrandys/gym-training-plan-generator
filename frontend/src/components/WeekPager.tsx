import { Link } from 'react-router'
import { weekHash } from '../lib/week-hash'

type WeekPagerProps = {
  weekCount: number
  current: number
}

export const WeekPager = ({ weekCount, current }: WeekPagerProps) => (
  <nav aria-label="Week pager" className="week-pager">
    {current > 1 ? (
      <Link
        to={weekHash(current - 1)}
        replace
        aria-label={`Previous week (Week ${current - 1})`}
      >
        <span aria-hidden="true">‹ </span>Week {current - 1}
      </Link>
    ) : (
      <span />
    )}
    {current < weekCount ? (
      <Link to={weekHash(current + 1)} replace aria-label={`Next week (Week ${current + 1})`}>
        Week {current + 1}
        <span aria-hidden="true"> ›</span>
      </Link>
    ) : (
      <span />
    )}
  </nav>
)
