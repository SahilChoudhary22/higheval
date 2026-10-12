import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import OverviewView from '@/views/OverviewView.vue';
import { useSession } from '@/composables/useSession';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    /** Reachable without signing in. */
    public?: boolean;
    /** Rendered without the app shell (navigation rail). */
    bare?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Sign in', public: true, bare: true },
  },
  { path: '/', name: 'overview', component: OverviewView, meta: { title: 'Overview' } },
  {
    path: '/experiments',
    component: () => import('@/views/ExperimentsView.vue'),
    meta: { title: 'Experiments' },
  },
  {
    path: '/experiments/new',
    component: () => import('@/views/NewExperimentView.vue'),
    meta: { title: 'Launch experiment' },
  },
  {
    path: '/experiments/:id',
    component: () => import('@/views/ExperimentView.vue'),
    props: true,
    meta: { title: 'Experiment' },
  },
  {
    path: '/runs/:id',
    component: () => import('@/views/RunView.vue'),
    props: true,
    meta: { title: 'Run' },
  },
  { path: '/suites', component: () => import('@/views/SuitesView.vue'), meta: { title: 'Suites' } },
  {
    path: '/suites/new',
    component: () => import('@/views/SuiteEditorView.vue'),
    meta: { title: 'New suite' },
  },
  {
    path: '/suites/:id',
    component: () => import('@/views/SuiteView.vue'),
    props: true,
    meta: { title: 'Suite' },
  },
  {
    path: '/suites/:id/edit',
    component: () => import('@/views/SuiteEditorView.vue'),
    props: true,
    meta: { title: 'Edit suite' },
  },
  {
    path: '/agents',
    component: () => import('@/views/ConfigsView.vue'),
    meta: { title: 'Agents' },
  },
  {
    path: '/agents/new',
    component: () => import('@/views/ConfigEditorView.vue'),
    meta: { title: 'New agent' },
  },
  {
    path: '/agents/:id/edit',
    component: () => import('@/views/ConfigEditorView.vue'),
    props: true,
    meta: { title: 'Edit agent' },
  },
  { path: '/skills', component: () => import('@/views/SkillsView.vue'), meta: { title: 'Skills' } },
  {
    path: '/skills/new',
    component: () => import('@/views/SkillEditorView.vue'),
    meta: { title: 'New skill' },
  },
  {
    path: '/skills/:id/edit',
    component: () => import('@/views/SkillEditorView.vue'),
    props: true,
    meta: { title: 'Edit skill' },
  },
  {
    path: '/settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Settings' },
  },
  // Agents were called "configs" before; keep old links working.
  {
    path: '/configs/:rest(.*)*',
    redirect: (to) => ['/agents', ...[to.params.rest ?? []].flat()].join('/'),
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Not found' },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});

// When the deployment requires sign-in, every page but the login screen needs a session.
router.beforeEach(async (to) => {
  const { load } = useSession();
  const session = await load().catch(() => null);
  if (!session?.authRequired) return to.path === '/login' ? '/' : true;
  if (to.meta.public) return session.authenticated ? '/' : true;
  return session.authenticated ? true : { path: '/login', query: { next: to.fullPath } };
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  document.title = title ? `${title} · HighEval` : 'HighEval';
});

export default router;
