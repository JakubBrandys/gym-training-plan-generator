import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { AuthUser } from '../src/auth/auth-user.js';
import { SupabaseJwtVerifier } from '../src/auth/supabase-jwt.verifier.js';
import type { ProfileRole } from '../src/generated/prisma/client.js';
import { PlanJobStore } from '../src/plan-generation/plan-job.store.js';
import { PlanPipelineService } from '../src/plan-generation/plan-pipeline.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SupabaseAdminClient } from '../src/supabase-admin/supabase-admin.client.js';

const TEST_ENV: Record<string, string> = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  OPENAI_API_KEY: 'sk-test',
  PLAN_DRAFT_MODEL: 'draft-model',
  PLAN_REVIEW_MODEL: 'review-model',
};

const previousEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [name, value] of Object.entries(TEST_ENV)) {
    previousEnv[name] = process.env[name];
    process.env[name] = value;
  }
});

afterAll(() => {
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

interface ProfileRow {
  id: string;
  email: string;
  role: ProfileRole;
  blockedAt: Date | null;
  createdAt: Date;
  internalNote: string;
}

type Projection = Record<string, boolean> | undefined;

const project = (row: ProfileRow, select: Projection): unknown => {
  const copy = structuredClone(row) as unknown as Record<string, unknown>;
  if (!select) {
    return copy;
  }
  return Object.fromEntries(
    Object.keys(select)
      .filter((key) => select[key])
      .map((key) => [key, copy[key]]),
  );
};

class FakeProfileTable {
  rows: ProfileRow[] = [];

  seed(row: Pick<ProfileRow, 'id' | 'email'> & Partial<ProfileRow>): void {
    this.rows.push({
      role: 'MEMBER',
      blockedAt: null,
      createdAt: new Date(),
      internalNote: 'must never be exposed',
      ...row,
    });
  }

  findMany = vi.fn(
    ({
      select,
      orderBy,
    }: {
      select?: Projection;
      orderBy: Array<{ createdAt?: 'asc' | 'desc'; id?: 'asc' | 'desc' }>;
    }) => {
      const sorted = [...this.rows].sort((a, b) => {
        for (const order of orderBy) {
          const direction = Object.values(order)[0] === 'desc' ? -1 : 1;
          const field = Object.keys(order)[0] as 'createdAt' | 'id';
          const left = a[field] instanceof Date ? a[field].getTime() : a[field];
          const right =
            b[field] instanceof Date ? b[field].getTime() : b[field];
          if (left < right) {
            return -direction;
          }
          if (left > right) {
            return direction;
          }
        }
        return 0;
      });
      return Promise.resolve(sorted.map((row) => project(row, select)));
    },
  );

  findUnique = vi.fn(
    ({ where, select }: { where: { id: string }; select?: Projection }) => {
      const row = this.rows.find((candidate) => candidate.id === where.id);
      return Promise.resolve(row ? project(row, select) : null);
    },
  );

  create = vi.fn(({ data }: { data: { id: string; email: string } }) => {
    this.seed(data);
    return Promise.resolve(
      project(this.rows[this.rows.length - 1]!, undefined),
    );
  });

  update = vi.fn(
    ({ where, data }: { where: { id: string }; data: Partial<ProfileRow> }) => {
      const row = this.rows.find((candidate) => candidate.id === where.id);
      if (!row) {
        return Promise.reject(new Error('Record to update not found'));
      }
      Object.assign(row, data);
      return Promise.resolve(project(row, undefined));
    },
  );

  updateMany = vi.fn(
    ({
      where,
      data,
    }: {
      where: { id?: string; role?: ProfileRole; blockedAt?: null };
      data: Partial<ProfileRow>;
    }) => {
      const matches = this.rows.filter(
        (row) =>
          (where.id === undefined || row.id === where.id) &&
          (where.role === undefined || row.role === where.role) &&
          (where.blockedAt === undefined ||
            (where.blockedAt === null && row.blockedAt === null)),
      );
      matches.forEach((row) => Object.assign(row, data));
      return Promise.resolve({ count: matches.length });
    },
  );
}

class FakeSavedPlanTable {
  findMany = vi.fn(() => Promise.resolve([]));
  findFirst = vi.fn(() => Promise.resolve(null));
  findUnique = vi.fn(() => Promise.resolve(null));
  create = vi.fn(() => Promise.resolve(null));
  updateMany = vi.fn(() => Promise.resolve({ count: 0 }));
  deleteMany = vi.fn(() => Promise.resolve({ count: 0 }));
}

const ACTIVE_MEMBER_ID = '10000000-0000-4000-8000-000000000001';
const BLOCKED_MEMBER_ID = '10000000-0000-4000-8000-000000000002';
const ACTIVE_ADMIN_ID = '10000000-0000-4000-8000-000000000003';
const OTHER_MEMBER_ID = '10000000-0000-4000-8000-000000000004';
const UNKNOWN_ID = '10000000-0000-4000-8000-0000000000ff';

const ACTIVE_MEMBER_TOKEN = 'active-member-token';
const BLOCKED_MEMBER_TOKEN = 'blocked-member-token';
const ACTIVE_ADMIN_TOKEN = 'active-admin-token';
const OTHER_MEMBER_TOKEN = 'other-member-token';
const FORGED_TOKEN = 'forged-token';
const EXPIRED_BLOCKED_MEMBER_TOKEN = 'expired-blocked-member-token';
const BLOCKED_MEMBER_NEW_EMAIL_TOKEN = 'blocked-member-new-email-token';

const TOKEN_OWNERS: Record<string, AuthUser> = {
  [ACTIVE_MEMBER_TOKEN]: {
    id: ACTIVE_MEMBER_ID,
    email: 'active-member@example.com',
  },
  [BLOCKED_MEMBER_TOKEN]: {
    id: BLOCKED_MEMBER_ID,
    email: 'blocked-member@example.com',
  },
  [ACTIVE_ADMIN_TOKEN]: {
    id: ACTIVE_ADMIN_ID,
    email: 'active-admin@example.com',
  },
  [OTHER_MEMBER_TOKEN]: {
    id: OTHER_MEMBER_ID,
    email: 'other-member@example.com',
  },
  [BLOCKED_MEMBER_NEW_EMAIL_TOKEN]: {
    id: BLOCKED_MEMBER_ID,
    email: 'changed@example.com',
  },
};

const BLOCKED_MEMBER_SEEDED_AT = new Date('2026-03-01T00:00:00Z');

const VALID_GENERATION_BODY = {
  experience: 'intermediate',
  currentFrequency: 3,
  desiredFrequency: 4,
  heightCm: 180,
  weightKg: 80,
  goals: 'Build strength',
};

const PUBLIC_ROUTES = ['GET /', 'GET /health'];

const ROUTE_FLOOR = [
  'POST /plan-generations',
  'GET /plan-generations/:jobId/events',
  'GET /saved-plans',
  'GET /me',
  'GET /admin/users',
];

const BLOCKED_MESSAGE = 'Account is blocked';

interface DiscoveredRoute {
  method: string;
  path: string;
}

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

interface Outcome {
  route: DiscoveredRoute;
  status: number;
  message: unknown;
}

const routeKey = (route: DiscoveredRoute): string =>
  `${route.method} ${route.path}`;

const isPublicRoute = (route: DiscoveredRoute): boolean =>
  PUBLIC_ROUTES.includes(routeKey(route));

const isAdminRoute = (route: DiscoveredRoute): boolean =>
  route.path.startsWith('/admin/');

const discoverRoutes = (app: INestApplication): DiscoveredRoute[] => {
  const instance = app.getHttpAdapter().getInstance() as {
    router: { stack: RouteLayer[] };
  };
  return instance.router.stack.flatMap((layer) => {
    const { route } = layer;
    if (!route) {
      return [];
    }
    return Object.keys(route.methods)
      .filter((method) => route.methods[method])
      .map((method) => ({ method: method.toUpperCase(), path: route.path }));
  });
};

const fillParams = (path: string): string =>
  path.replace(/:[A-Za-z]+/g, UNKNOWN_ID);

const sendRoute = (
  app: INestApplication,
  route: DiscoveredRoute,
  token?: string,
): request.Test => {
  const verb = route.method.toLowerCase() as
    'get' | 'post' | 'patch' | 'delete';
  const call = request(app.getHttpServer())[verb](fillParams(route.path));
  const authorized =
    token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
  return route.method === 'POST' || route.method === 'PATCH'
    ? authorized.send({})
    : authorized;
};

const probeRoutes = async (
  app: INestApplication,
  routes: DiscoveredRoute[],
  token?: string,
): Promise<Outcome[]> => {
  const outcomes: Outcome[] = [];
  for (const route of routes) {
    const response = await sendRoute(app, route, token);
    outcomes.push({
      route,
      status: response.status,
      message: (response.body as { message?: unknown } | undefined)?.message,
    });
  }
  return outcomes;
};

const describeOutcome = (outcome: Outcome): string =>
  `${routeKey(outcome.route)} -> ${outcome.status}${
    outcome.message === undefined ? '' : ` ${JSON.stringify(outcome.message)}`
  }`;

const refusedEverywhere = (
  outcomes: Outcome[],
  status: number,
  message?: string,
): string[] =>
  outcomes
    .filter(
      (outcome) =>
        outcome.status !== status ||
        (message !== undefined && outcome.message !== message),
    )
    .map(describeOutcome);

describe('Access control across every route (http, real AppModule and AuthGuard)', () => {
  let app: INestApplication;
  let table: FakeProfileTable;
  let savedPlans: FakeSavedPlanTable;
  let pipelineRun: ReturnType<typeof vi.fn>;
  let banUser: ReturnType<typeof vi.fn>;
  let verify: ReturnType<typeof vi.fn>;
  let routes: DiscoveredRoute[];
  let gatedRoutes: DiscoveredRoute[];

  const seedProfiles = (): void => {
    table.seed({
      id: ACTIVE_MEMBER_ID,
      email: 'active-member@example.com',
    });
    table.seed({
      id: BLOCKED_MEMBER_ID,
      email: 'blocked-member@example.com',
      blockedAt: BLOCKED_MEMBER_SEEDED_AT,
    });
    table.seed({
      id: ACTIVE_ADMIN_ID,
      email: 'active-admin@example.com',
      role: 'ADMIN',
    });
    table.seed({
      id: OTHER_MEMBER_ID,
      email: 'other-member@example.com',
    });
  };

  const expectNoWrites = (): void => {
    expect(pipelineRun).not.toHaveBeenCalled();
    expect(banUser).not.toHaveBeenCalled();
    expect(table.create).not.toHaveBeenCalled();
    expect(table.update).not.toHaveBeenCalled();
    expect(table.updateMany).not.toHaveBeenCalled();
    expect(savedPlans.create).not.toHaveBeenCalled();
    expect(savedPlans.updateMany).not.toHaveBeenCalled();
    expect(savedPlans.deleteMany).not.toHaveBeenCalled();
  };

  beforeEach(async () => {
    table = new FakeProfileTable();
    savedPlans = new FakeSavedPlanTable();
    seedProfiles();
    pipelineRun = vi.fn(() => new Promise<void>(() => undefined));
    banUser = vi.fn().mockResolvedValue(undefined);
    verify = vi.fn((token: string) => {
      const owner = TOKEN_OWNERS[token];
      return owner
        ? Promise.resolve(owner)
        : Promise.reject(new UnauthorizedException('Invalid token'));
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        profile: table,
        savedPlan: savedPlans,
        $queryRaw: vi.fn(() => Promise.resolve([{ '?column?': 1 }])),
      })
      .overrideProvider(SupabaseJwtVerifier)
      .useValue({ verify })
      .overrideProvider(SupabaseAdminClient)
      .useValue({ banUser })
      .overrideProvider(PlanPipelineService)
      .useValue({ run: pipelineRun })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    routes = discoverRoutes(app);
    gatedRoutes = routes.filter((route) => !isPublicRoute(route));
  });

  afterEach(async () => {
    await app.close();
  });

  describe('route discovery', () => {
    it('lists the routes the PRD names, so the table is not vacuous', () => {
      const discovered = routes.map(routeKey);

      expect(discovered).toEqual(expect.arrayContaining(ROUTE_FLOOR));
    });
  });

  describe('a blocked member with a valid token', () => {
    it('is refused with 403 "Account is blocked" on every gated route', async () => {
      const outcomes = await probeRoutes(
        app,
        gatedRoutes,
        BLOCKED_MEMBER_TOKEN,
      );

      expect(refusedEverywhere(outcomes, 403, BLOCKED_MESSAGE)).toEqual([]);
    });

    it('is refused on every admin route with 403, never the 404 disguise', async () => {
      const adminRoutes = gatedRoutes.filter(isAdminRoute);

      const outcomes = await probeRoutes(
        app,
        adminRoutes,
        BLOCKED_MEMBER_TOKEN,
      );

      expect(adminRoutes.length).toBeGreaterThan(0);
      expect(refusedEverywhere(outcomes, 403, BLOCKED_MESSAGE)).toEqual([]);
    });

    it('starts no generation and writes nothing on any gated route', async () => {
      await probeRoutes(app, gatedRoutes, BLOCKED_MEMBER_TOKEN);

      expectNoWrites();
    });
  });

  describe('a block applied through the real admin endpoint', () => {
    const postBlock = (memberId: string, token: string): request.Test =>
      request(app.getHttpServer())
        .post(`/admin/users/${memberId}/block`)
        .set('Authorization', `Bearer ${token}`);

    const memberRow = (id: string): ProfileRow =>
      table.rows.find((row) => row.id === id)!;

    it('refuses the same still-valid token on every gated route from the next request', async () => {
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${ACTIVE_MEMBER_TOKEN}`)
        .expect(200);

      const blocked = await postBlock(
        ACTIVE_MEMBER_ID,
        ACTIVE_ADMIN_TOKEN,
      ).expect(200);
      const outcomes = await probeRoutes(app, gatedRoutes, ACTIVE_MEMBER_TOKEN);

      expect((blocked.body as { blockedAt: unknown }).blockedAt).not.toBeNull();
      expect(memberRow(ACTIVE_MEMBER_ID).blockedAt).toBeInstanceOf(Date);
      expect(refusedEverywhere(outcomes, 403, BLOCKED_MESSAGE)).toEqual([]);
    });

    it('is refused by the profile, not by token invalidation: the verifier still accepts the token', async () => {
      await postBlock(ACTIVE_MEMBER_ID, ACTIVE_ADMIN_TOKEN).expect(200);
      verify.mockClear();

      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${ACTIVE_MEMBER_TOKEN}`)
        .expect(403);

      expect(verify).toHaveBeenCalledWith(ACTIVE_MEMBER_TOKEN);
      await expect(verify.mock.results[0]!.value).resolves.toEqual({
        id: ACTIVE_MEMBER_ID,
        email: 'active-member@example.com',
      });
    });

    it('leaves a second member with a valid token unaffected', async () => {
      await postBlock(ACTIVE_MEMBER_ID, ACTIVE_ADMIN_TOKEN).expect(200);

      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${OTHER_MEMBER_TOKEN}`)
        .expect(200);
      expect(memberRow(OTHER_MEMBER_ID).blockedAt).toBeNull();
    });

    describe('when the Supabase ban fails', () => {
      it('answers 502 without the upstream detail, keeps the block and refuses the member everywhere', async () => {
        banUser.mockRejectedValueOnce(new Error('supabase-detail-xyz'));

        const failed = await postBlock(
          ACTIVE_MEMBER_ID,
          ACTIVE_ADMIN_TOKEN,
        ).expect(502);
        const outcomes = await probeRoutes(
          app,
          gatedRoutes,
          ACTIVE_MEMBER_TOKEN,
        );

        expect(JSON.stringify(failed.body)).not.toContain(
          'supabase-detail-xyz',
        );
        expect(failed.text).not.toContain('supabase-detail-xyz');
        expect(memberRow(ACTIVE_MEMBER_ID).blockedAt).toBeInstanceOf(Date);
        expect(refusedEverywhere(outcomes, 403, BLOCKED_MESSAGE)).toEqual([]);
      });

      it('shows the half-applied block to the admin as a non-null blockedAt in the user list', async () => {
        banUser.mockRejectedValueOnce(new Error('supabase-detail-xyz'));
        await postBlock(ACTIVE_MEMBER_ID, ACTIVE_ADMIN_TOKEN).expect(502);

        const list = await request(app.getHttpServer())
          .get('/admin/users')
          .set('Authorization', `Bearer ${ACTIVE_ADMIN_TOKEN}`)
          .expect(200);

        const listed = (
          list.body as Array<{ id: string; blockedAt: string | null }>
        ).find((user) => user.id === ACTIVE_MEMBER_ID);
        expect(listed).toBeDefined();
        expect(listed!.blockedAt).not.toBeNull();
      });

      it('is repaired by repeating the block: 200, original blockedAt kept, ban retried', async () => {
        banUser.mockRejectedValueOnce(new Error('supabase-detail-xyz'));
        await postBlock(ACTIVE_MEMBER_ID, ACTIVE_ADMIN_TOKEN).expect(502);
        const keptBlockedAt = memberRow(ACTIVE_MEMBER_ID).blockedAt!.getTime();

        await postBlock(ACTIVE_MEMBER_ID, ACTIVE_ADMIN_TOKEN).expect(200);

        expect(memberRow(ACTIVE_MEMBER_ID).blockedAt!.getTime()).toBe(
          keptBlockedAt,
        );
        expect(banUser).toHaveBeenCalledTimes(2);
        expect(banUser).toHaveBeenNthCalledWith(2, ACTIVE_MEMBER_ID);
      });
    });
  });

  describe('edges around the guard for a blocked member', () => {
    it('refuses three generation starts without running the pipeline or holding a job', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await request(app.getHttpServer())
          .post('/plan-generations')
          .set('Authorization', `Bearer ${BLOCKED_MEMBER_TOKEN}`)
          .send(VALID_GENERATION_BODY);

        expect(response.status).toBe(403);
      }

      expect(pipelineRun).not.toHaveBeenCalled();
      expect(app.get(PlanJobStore).hasActive(BLOCKED_MEMBER_ID)).toBe(false);
    });

    it('stays blocked when the token carries a different email than the stored row', async () => {
      const response = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${BLOCKED_MEMBER_NEW_EMAIL_TOKEN}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ message: BLOCKED_MESSAGE });
      const row = table.rows.find(
        (candidate) => candidate.id === BLOCKED_MEMBER_ID,
      );
      expect(row!.blockedAt).toEqual(BLOCKED_MEMBER_SEEDED_AT);
    });
  });

  describe('a caller who is not authenticated', () => {
    it('gets 401 on every gated route without an Authorization header', async () => {
      const outcomes = await probeRoutes(app, gatedRoutes);

      expect(refusedEverywhere(outcomes, 401)).toEqual([]);
    });

    it('gets 401 on every gated route with a forged token', async () => {
      const outcomes = await probeRoutes(app, gatedRoutes, FORGED_TOKEN);

      expect(refusedEverywhere(outcomes, 401)).toEqual([]);
    });

    it('gets 401, never 403, for a blocked member whose token fails verification', async () => {
      const outcomes = await probeRoutes(
        app,
        gatedRoutes,
        EXPIRED_BLOCKED_MEMBER_TOKEN,
      );

      expect(refusedEverywhere(outcomes, 401)).toEqual([]);
      expect(table.findUnique).not.toHaveBeenCalled();
      expectNoWrites();
    });
  });

  describe('an active member and an active admin', () => {
    it('are admitted past the guard on every gated route outside /admin/', async () => {
      const memberRoutes = gatedRoutes.filter((route) => !isAdminRoute(route));

      const outcomes = await probeRoutes(
        app,
        memberRoutes,
        ACTIVE_MEMBER_TOKEN,
      );

      expect(memberRoutes.length).toBeGreaterThan(0);
      expect(
        outcomes
          .filter((outcome) => outcome.status === 401 || outcome.status === 403)
          .map(describeOutcome),
      ).toEqual([]);
    });

    it('lets an active admin list users with 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${ACTIVE_ADMIN_TOKEN}`)
        .expect(200);

      expect((response.body as Array<{ id: string }>).map((p) => p.id)).toEqual(
        expect.arrayContaining([
          ACTIVE_MEMBER_ID,
          BLOCKED_MEMBER_ID,
          ACTIVE_ADMIN_ID,
          OTHER_MEMBER_ID,
        ]),
      );
    });
  });

  describe('public routes', () => {
    it.each(PUBLIC_ROUTES)(
      'answers 200 on %s to a blocked member and to no token',
      async (key) => {
        const [method, path] = key.split(' ') as [string, string];
        const route = { method, path };

        const withBlockedToken = await sendRoute(
          app,
          route,
          BLOCKED_MEMBER_TOKEN,
        );
        const withoutToken = await sendRoute(app, route);

        expect([withBlockedToken.status, withoutToken.status]).toEqual([
          200, 200,
        ]);
      },
    );
  });
});
