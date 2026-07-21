export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {description ? <p className="mt-1 text-neutral-500 dark:text-neutral-400">{description}</p> : null}
    </header>
  );
}
