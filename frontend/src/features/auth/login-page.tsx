import { Button } from "@/components/ui/button";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        {/* Logo + Title */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">
              CT
            </span>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              CantonTrace
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Canton Network Debugging Platform
            </p>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 text-center">
            <h2 className="text-sm font-medium text-foreground">
              Sign in to continue
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Authenticate with your GitHub account
            </p>
          </div>

          <a href="/api/v1/auth/github" className="block">
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2"
              asChild
            >
              <span>
                <GitHubIcon className="size-4" />
                Sign in with GitHub
              </span>
            </Button>
          </a>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-muted-foreground/60">
          Only authorized team members can access this instance.
        </p>
      </div>
    </div>
  );
}
