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

const contractsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contracts",
  component: lazyRouteComponent(
    () => import("@/features/contracts/page")
  ),
});

const contractDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contracts/$contractId",
  component: lazyRouteComponent(
    () => import("@/features/contracts/page")
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
    () => import("@/features/events/page")
  ),
});

const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  component: lazyRouteComponent(
    () => import("@/features/transactions/page")
  ),
});

const transactionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions/$updateId",
  component: lazyRouteComponent(
    () => import("@/features/transactions/page")
  ),
});

const debuggerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debugger",
  component: lazyRouteComponent(
    () => import("@/features/debugger/page")
  ),
});

const sandboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sandbox",
  component: lazyRouteComponent(
    () => import("@/features/sandbox-manager/page")
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
  contractsRoute,
  contractDetailRoute,
  templatesRoute,
  eventsRoute,
  transactionsRoute,
  transactionDetailRoute,
  debuggerRoute,
  sandboxRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
