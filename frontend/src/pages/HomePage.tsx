import { ButtonLink } from '../components/ButtonLink'

export const HomePage = () => (
  <main className="home">
    <h1>Welcome</h1>
    <p className="status">
      Generate an AI-assisted 8-week training plan from your experience, schedule and goals.
    </p>
    <div className="home-actions">
      <ButtonLink to="/plans/new">Create a training plan</ButtonLink>
    </div>
  </main>
)
