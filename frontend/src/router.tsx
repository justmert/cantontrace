import {
  createRouter,
  createRoute,
  createRootRoute,
  lazyRouteComponent,
  Outlet,
} from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";

const rootRoute = createRootRoute({
  component: Outlet,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: lazyRouteComponent(
    () => import("@/features/auth/login-page")
  ),
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: lazyRouteComponent(
    () => import("@/features/dashboard/page")
  ),
});

const contractsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/contracts",
  component: lazyRouteComponent(
    () => import("@/features/contracts/page")
  ),
});

const contractDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/contracts/$contractId",
  component: lazyRouteComponent(
    () => import("@/features/contracts/page")
  ),
});

const templatesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/templates",
  component: lazyRouteComponent(
    () => import("@/features/template-explorer/page")
  ),
});

const eventsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/events",
  component: lazyRouteComponent(
    () => import("@/features/events/page")
  ),
});

const transactionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/transactions",
  component: lazyRouteComponent(
    () => import("@/features/transactions/page")
  ),
});

const transactionDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/transactions/$updateId",
  component: lazyRouteComponent(
    () => import("@/features/transactions/page")
  ),
});

const debuggerRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/debugger",
  component: lazyRouteComponent(
    () => import("@/features/debugger/page")
  ),
});

const sandboxRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/sandbox",
  component: lazyRouteComponent(
    () => import("@/features/sandbox-manager/page")
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: lazyRouteComponent(
    () => import("@/features/settings/page")
  ),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayoutRoute.addChildren([
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
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
