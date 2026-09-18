import { ErrorState, Loading, quantityLabel } from './components';

export default function DashboardSummary({ buyer, data, loading, error, reload }) {
  if (loading)
    return (
      <section className="dashboard-summary" aria-label="Dashboard summary">
        <Loading label="Loading summary..." />
      </section>
    );
  if (error)
    return (
      <section className="dashboard-summary" aria-label="Dashboard summary">
        <ErrorState error={error} retry={reload} />
      </section>
    );
  const counts = buyer
    ? [
        ['Total RFQs', data.summary.totalRfqs],
        ['Quotations received', data.summary.totalQuotations],
      ]
    : [
        ['Available RFQs', data.summary.availableRfqs],
        ['My quotations', data.summary.myQuotations],
      ];
  return (
    <section aria-label="Dashboard summary">
      <dl className="dashboard-summary">
        {counts.map(([label, count]) => (
          <div className="summary-card" key={label}>
            <dt>{label}</dt>
            <dd>{quantityLabel(count)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
