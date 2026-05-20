import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SyncStatus } from "@/components/SyncStatus";
import { useSyncEngine } from "@/hooks/use-sync-engine";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-card max-w-md rounded-2xl p-8 text-center">
        <h1 className="font-display text-6xl gold-text">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">Cette page n'existe pas.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg btn-gold px-5 py-2.5 text-sm"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-card max-w-md rounded-2xl p-8 text-center">
        <h1 className="font-display text-2xl">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-lg btn-gold px-5 py-2.5 text-sm"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#141414" },
      { title: "AURUM SYSTEM — Voix → Document" },
      { name: "description", content: "Transformez vos prises de parole terrain en rapports et procès-verbaux structurés grâce à l'IA." },
      { property: "og:title", content: "AURUM SYSTEM — Voix → Document" },
      { name: "twitter:title", content: "AURUM SYSTEM — Voix → Document" },
      { property: "og:description", content: "Transformez vos prises de parole terrain en rapports et procès-verbaux structurés grâce à l'IA." },
      { name: "twitter:description", content: "Transformez vos prises de parole terrain en rapports et procès-verbaux structurés grâce à l'IA." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/47ceb11a-d241-44eb-9f8c-0a1567cad8f3/id-preview-323754ce--645adec6-0849-48e4-a4da-7eda3d3b0371.lovable.app-1779227803834.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/47ceb11a-d241-44eb-9f8c-0a1567cad8f3/id-preview-323754ce--645adec6-0849-48e4-a4da-7eda3d3b0371.lovable.app-1779227803834.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useSyncEngine();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="mx-auto max-w-xl min-h-screen">
        <div className="fixed top-3 right-3 z-50">
          <SyncStatus />
        </div>
        <Outlet />
      </div>
      <Toaster theme="dark" position="top-center" />
    </QueryClientProvider>
  );
}
