import { loadEvalCatalog, parseSeedCatalog } from './eval-catalog.js';

describe('eval catalog', () => {
  it('maps seed levels to the database enum values the prompt shows', () => {
    const [exercise] = parseSeedCatalog(
      JSON.stringify([
        {
          slug: 'squat',
          name: 'Squat',
          primaryMuscles: ['quadriceps'],
          equipment: 'barbell',
          level: 'intermediate',
          category: 'strength',
          imageKey: 'exercises/squat.jpg',
        },
      ]),
    );
    expect(exercise.level).toBe('INTERMEDIATE');
  });

  it('rejects an unknown level', () => {
    expect(() =>
      parseSeedCatalog(
        JSON.stringify([
          {
            slug: 'squat',
            name: 'Squat',
            primaryMuscles: [],
            equipment: 'barbell',
            level: 'elite',
            category: 'strength',
            imageKey: 'x',
          },
        ]),
      ),
    ).toThrow('Unknown exercise level "elite" for squat.');
  });

  it('loads the seed catalog of 32 exercises', async () => {
    const catalog = await loadEvalCatalog();
    expect(catalog).toHaveLength(32);
    expect(catalog.every((exercise) => exercise.slug.length > 0)).toBe(true);
  });
});
