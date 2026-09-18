import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Loading, PageHeading, RfqCard, useResource } from '../components';

export default function SavedRfqs() {
  const { data, loading, error, reload } = useResource('/rfqs/saved');
  return (
    <>
      <PageHeading eyebrow="SUPPLIER WORKSPACE" title="Saved RFQs">
        Requests you want to keep handy. Closed and expired requests remain here until you remove
        them.
      </PageHeading>
      {loading ? (
        <Loading label="Loading saved RFQs..." />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : !data.rfqs.length ? (
        <EmptyState
          title="No saved RFQs yet."
          action={
            <Link className="button primary" to="/rfqs">
              Browse RFQs
            </Link>
          }
        >
          Save requests while browsing to find them here later.
        </EmptyState>
      ) : (
        <div className="rfq-grid">
          {data.rfqs.map((rfq) => (
            <RfqCard key={rfq.id} rfq={rfq} savedPage onSavedChange={reload} />
          ))}
        </div>
      )}
    </>
  );
}
