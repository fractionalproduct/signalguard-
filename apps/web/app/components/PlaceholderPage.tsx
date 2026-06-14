export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>{title}</h1>
      <p className="lead">{description}</p>
      <div className="empty-state" role="status">
        Coming in a later milestone
      </div>
    </section>
  );
}
