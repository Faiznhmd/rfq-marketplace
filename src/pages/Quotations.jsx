import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock3, MapPin } from 'lucide-react';
import {
  dateLabel,
  EmptyState,
  ErrorState,
  Loading,
  PageHeading,
  priceLabel,
  useResource,
} from '../components';

export default function Quotations() {
  const { data, loading, error, reload } = useResource('/quotations/my');
  return (
    <>
      <PageHeading eyebrow="SUPPLIER WORKSPACE" title="Every offer, in one place.">
        A record of your submitted quotations and the requests behind them.
      </PageHeading>
      <div className="section-heading">
        <h2>My quotations</h2>
        <span>Your submitted responses</span>
      </div>
      {loading ? (
        <Loading label="Loading your quotations…" />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : !data.quotations.length ? (
        <EmptyState
          title="Your first offer is an opportunity"
          action={
            <Link className="button primary" to="/rfqs">
              Browse open RFQs
              <ArrowUpRight size={17} />
            </Link>
          }
        >
          Find a request that fits what you supply, then send the buyer your quotation.
        </EmptyState>
      ) : (
        <div className="history-list">
          {data.quotations.map((quote) => (
            <article className="history-card" key={quote.id}>
              <div className="history-main">
                <span className="eyebrow">SUBMITTED {dateLabel(quote.createdAt)}</span>
                <h2>
                  <Link to={`/rfqs/${quote.rfqId}`}>{quote.productName}</Link>
                </h2>
                <div className="history-meta">
                  <span>
                    <Clock3 size={16} />
                    {quote.deliveryTime}
                  </span>
                  <span>
                    <MapPin size={16} />
                    {quote.deliveryLocation}
                  </span>
                </div>
                {quote.message && <p className="quote-message">{quote.message}</p>}
              </div>
              <div className="history-price">
                <span>Quoted total · USD</span>
                <strong>{priceLabel(quote.price)}</strong>
                <Link className="text-link" to={`/rfqs/${quote.rfqId}`}>
                  View request
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
