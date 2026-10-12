import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import OverviewView from '@/views/OverviewView.vue';

const routes: RouteRecordRaw[] = [
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
    path: '/configs',
    component: () => import('@/views/ConfigsView.vue'),
    meta: { title: 'Configs' },
  },
  {
    path: '/configs/new',
    component: () => import('@/views/ConfigEditorView.vue'),
    meta: { title: 'New config' },
  },
  {
    path: '/configs/:id/edit',
    component: () => import('@/views/ConfigEditorView.vue'),
    props: true,
    meta: { title: 'Edit config' },
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

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  document.title = title ? `${title} · HighEval` : 'HighEval';
});

export default router;
