type Props = {
  title: string;
  description: string;
};

export function PagePlaceholder({ title, description }: Props) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="page-title">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="border border-dashed border-border rounded-lg p-12 text-center bg-card">
        <p className="text-sm text-muted-foreground">
          Coming soon. This page is part of the Phase 1 scaffold.
        </p>
      </div>
    </section>
  );
}
