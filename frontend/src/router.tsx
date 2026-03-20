import {
  createRouter,
  createRoute,
  createRootRoute,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";

const rootRoute = createRootRoute({
  component: AppLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(
    () => import("@/features/dashboard/page")
  ),
});

const acsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/acs",
  component: lazyRouteComponent(
    () => import("@/features/acs-inspector/page")
  ),
});

const templatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/templates",
  component: lazyRouteComponent(
    () => import("@/features/template-explorer/page")
  ),
});

const eventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/events",
  component: lazyRouteComponent(
    () => import("@/features/event-stream/page")
  ),
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  component: lazyRouteComponent(
    () => import("@/features/transaction-explorer/page")
  ),
});

const transactionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions/$updateId",
  component: lazyRouteComponent(
    () => import("@/features/transaction-explorer/page")
  ),
});

const errorsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/errors",
  component: lazyRouteComponent(
    () => import("@/features/error-debugger/page")
  ),
});

const contractsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contracts",
  component: lazyRouteComponent(
    () => import("@/features/contract-lifecycle/page")
  ),
});

const contractDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contracts/$contractId",
  component: lazyRouteComponent(
    () => import("@/features/contract-lifecycle/page")
  ),
});

const traceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trace",
  component: lazyRouteComponent(
    () => import("@/features/execution-trace/page")
  ),
});

const simulateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/simulate",
  component: lazyRouteComponent(
    () => import("@/features/simulator/page")
  ),
});

const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workflows",
  component: lazyRouteComponent(
    () => import("@/features/workflow-debugger/page")
  ),
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: lazyRouteComponent(
    () => import("@/features/privacy-visualizer/page")
  ),
});

const privacyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy/$updateId",
  component: lazyRouteComponent(
    () => import("@/features/privacy-visualizer/page")
  ),
});

const sandboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sandbox",
  component: lazyRouteComponent(
    () => import("@/features/sandbox-manager/page")
  ),
});

const reassignmentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reassignments",
  component: lazyRouteComponent(
    () => import("@/features/reassignment-tracker/page")
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(
    () => import("@/features/settings/page")
  ),
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  acsRoute,
  templatesRoute,
  eventsRoute,
  transactionsRoute,
  transactionDetailRoute,
  errorsRoute,
  contractsRoute,
  contractDetailRoute,
  traceRoute,
  simulateRoute,
  workflowsRoute,
  privacyRoute,
  privacyDetailRoute,
  sandboxRoute,
  reassignmentsRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
