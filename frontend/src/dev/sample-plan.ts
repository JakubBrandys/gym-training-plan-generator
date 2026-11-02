import type { PlanResult, PlanResultExercise, PlanResultWeek } from '../lib/plan-generation'

type SessionTemplate = {
  title: string
  slugs: string[]
}

type Scheme = {
  sets: number
  reps: string
  restSeconds: number
  goal: string
}

const SESSION_TEMPLATES: SessionTemplate[] = [
  {
    title: 'Push: chest, shoulders, triceps',
    slugs: [
      'incline-dumbbell-press',
      'standing-military-press',
      'dumbbell-flyes',
      'side-lateral-raise',
      'triceps-pushdown',
      'dips-triceps-version',
    ],
  },
  {
    title: 'Pull: back and biceps',
    slugs: [
      'wide-grip-lat-pulldown',
      'bent-over-barbell-row',
      'seated-cable-rows',
      'face-pull',
      'barbell-curl',
      'hammer-curls',
    ],
  },
  {
    title: 'Legs: quads, hamstrings, calves',
    slugs: [
      'barbell-squat',
      'romanian-deadlift',
      'leg-press',
      'lying-leg-curls',
      'leg-extensions',
      'standing-calf-raises',
    ],
  },
  {
    title: 'Upper body: volume',
    slugs: [
      'pullups',
      'pushups',
      'dumbbell-shoulder-press',
      'seated-cable-rows',
      'dumbbell-bicep-curl',
      'seated-triceps-press',
    ],
  },
  {
    title: 'Lower body and core',
    slugs: [
      'barbell-deadlift',
      'dumbbell-lunges',
      'barbell-hip-thrust',
      'single-leg-glute-bridge',
      'plank',
      'hanging-leg-raise',
    ],
  },
]

const SCHEMES: Scheme[] = [
  { sets: 3, reps: '10-12', restSeconds: 90, goal: 'Build a base: learn the movements and keep every set clean.' },
  { sets: 3, reps: '10-12', restSeconds: 90, goal: 'Add a little load while keeping two reps in reserve.' },
  { sets: 4, reps: '8-10', restSeconds: 90, goal: 'Move to four sets and push the main lifts closer to failure.' },
  { sets: 4, reps: '8-10', restSeconds: 90, goal: 'Hold the volume and aim for a rep more than last week.' },
  { sets: 4, reps: '6-8', restSeconds: 120, goal: 'Strength block: heavier loads with longer rests.' },
  { sets: 4, reps: '6-8', restSeconds: 120, goal: 'Keep the heavy work and tidy up technique under load.' },
  { sets: 5, reps: '5', restSeconds: 150, goal: 'Peak week: lowest reps, highest loads.' },
  { sets: 3, reps: '8-10', restSeconds: 75, goal: 'Deload: lighter loads so you finish the plan fresh.' },
]

const SESSIONS_PER_WEEK = [4, 4, 4, 5, 5, 5, 5, 5]

const NOTES = [
  'Keep your core braced and control the lowering phase.',
  'Stop one rep before form breaks down.',
  null,
  null,
  'Pause for a second at the bottom of each rep.',
  null,
]

const toName = (slug: string) =>
  slug
    .split('-')
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')

const buildExercise = (slug: string, scheme: Scheme, index: number): PlanResultExercise => ({
  slug,
  name: toName(slug),
  sets: scheme.sets,
  reps: scheme.reps,
  restSeconds: scheme.restSeconds,
  note: NOTES[index % NOTES.length] ?? null,
  imageKey: `exercises/${slug}.jpg`,
})

const buildWeek = (scheme: Scheme, weekIndex: number): PlanResultWeek => ({
  week: weekIndex + 1,
  goal: scheme.goal,
  sessions: SESSION_TEMPLATES.slice(0, SESSIONS_PER_WEEK[weekIndex]).map((template) => ({
    title: template.title,
    exercises: template.slugs.map((slug, index) => buildExercise(slug, scheme, index)),
  })),
})

export const buildSamplePlan = (): PlanResult => ({
  weeks: SCHEMES.map(buildWeek),
})

const EDGE_SLUGS = [
  'barbell-squat',
  'romanian-deadlift',
  'leg-press',
  'lying-leg-curls',
  'leg-extensions',
  'standing-calf-raises',
  'barbell-hip-thrust',
  'dumbbell-lunges',
  'single-leg-glute-bridge',
  'hanging-leg-raise',
]

const EDGE_TITLE = 'Full body strength with unilateral work, tempo reps and a long core finisher set'

const EDGE_GOAL =
  'Build a strong base across every lift, keep two reps in reserve on the main sets, and use the longer rests to recover fully before the heavier work in the weeks that follow this block. Take your time.'

const EDGE_NOTE =
  'Control the lowering phase for three seconds, pause briefly at the bottom of every rep, brace your core before every repetition, and stop every set one rep before your form breaks down on either side.'

const edgeExercise = (slug: string): PlanResultExercise => ({
  slug,
  name: toName(slug),
  sets: 8,
  reps: '10-12 each side, 3 s',
  restSeconds: 600,
  note: EDGE_NOTE,
  imageKey: `exercises/${slug}.jpg`,
})

const edgeWeek = (): PlanResultWeek => ({
  week: 1,
  goal: EDGE_GOAL,
  sessions: Array.from({ length: 7 }, (_, index) => ({
    title: index === 0 ? EDGE_TITLE : `Session ${index + 1} accessory work`,
    exercises: index === 0 ? EDGE_SLUGS.map(edgeExercise) : EDGE_SLUGS.slice(0, 3).map(edgeExercise),
  })),
})

export const buildEdgePlan = (): PlanResult => ({
  weeks: [edgeWeek(), ...buildSamplePlan().weeks.slice(1)],
})

export const buildPlanWithoutImages = (): PlanResult => ({
  weeks: buildSamplePlan().weeks.map((week) => ({
    ...week,
    sessions: week.sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) => ({ ...exercise, imageKey: null })),
    })),
  })),
})

export const buildPlanWithFailingImage = (): PlanResult => {
  const plan = buildSamplePlan()
  const [first, ...rest] = plan.weeks
  const [session, ...sessions] = first.sessions
  const [exercise, ...exercises] = session.exercises

  return {
    weeks: [
      {
        ...first,
        sessions: [
          {
            ...session,
            exercises: [{ ...exercise, imageKey: 'exercises/this-file-does-not-exist.jpg' }, ...exercises],
          },
          ...sessions,
        ],
      },
      ...rest,
    ],
  }
}
