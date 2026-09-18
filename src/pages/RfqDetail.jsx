import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Package,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../auth';
import { api } from '../api';
import {
  dateLabel,
  DeleteDialog,
  EmptyState,
  ErrorState,
  Field,
  inputProps,
  Loading,
  priceLabel,
  quantityLabel,
  Status,
  SubmitButton,
  useResource,
} from '../components';
import { fieldErrors, quotationSchema } from '../../shared/validation';

export default function RfqDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useResource(`/rfqs/${id}`);
  const [deleting, setDeleting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const buyer = user.role === 'BUYER';
  if (loading) return <Loading label="Loading request details…" />;
  if (error)
    return (
      <>
        <Link className="back-link" to="/rfqs">
          <ArrowLeft size={16} />
          Back to requests
        </Link>
        <ErrorState error={error} retry={reload} />
      </>
    );
  const { rfq, quotation } = data;
  return (
    <>
      <Link className="back-link" to="/rfqs">
        <ArrowLeft size={16} />
        {buyer ? 'Back to my RFQs' : 'Back to available requests'}
      </Link>
      {location.state?.notice && (
        <p className="success-banner" role="status">
          {location.state.notice}
        </p>
      )}
      <div className="detail-heading">
        <div>
          <div className="eyebrow">REQUEST FOR QUOTATION</div>
          <h1>{rfq.productName}</h1>
          <div className="detail-subtitle">
            <Status open={rfq.isOpen} />
            <span>Published {dateLabel(rfq.createdAt)}</span>
          </div>
        </div>
        {buyer && (
          <div className="detail-actions">
            <Link className="button secondary" to={`/rfqs/${id}/edit`}>
              <Pencil size={16} />
              Edit request
            </Link>
            <button
              className="icon-button delete-button"
              aria-label="Delete request"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
      <div className="detail-layout">
        <article className="detail-card">
          <div className="section-label">
            <Package size={18} />
            The requirement
          </div>
          <h2>About this request</h2>
          <p className="description-text">{rfq.description}</p>
          <dl className="detail-facts">
            <div>
              <dt>
                <Package size={18} />
                Quantity
              </dt>
              <dd>{quantityLabel(rfq.quantity)}</dd>
            </div>
            <div>
              <dt>
                <MapPin size={18} />
                Delivery location
              </dt>
              <dd>{rfq.deliveryLocation}</dd>
            </div>
            <div>
              <dt>
                <CalendarDays size={18} />
                Quotation deadline
              </dt>
              <dd>
                {dateLabel(rfq.deadline)}
                <small>Closes at 00:00 UTC</small>
              </dd>
            </div>
          </dl>
          <div className="posted-by">
            <span className="avatar">{rfq.buyerName.slice(0, 1).toUpperCase()}</span>
            <div>
              <span>Requested by</span>
              <strong>{rfq.buyerName}</strong>
            </div>
          </div>
        </article>
        {!buyer && (
          <aside>
            {quotation ? (
              <div className="quote-confirmation">
                <CheckCircle2 size={29} />
                <h2>Your quotation is submitted.</h2>
                <p>The buyer can now view your response.</p>
                <dl>
                  <div>
                    <dt>Quoted price</dt>
                    <dd>{priceLabel(quotation.price)}</dd>
                  </div>
                  <div>
                    <dt>Estimated delivery</dt>
                    <dd>{quotation.deliveryTime}</dd>
                  </div>
                </dl>
                {quotation.message && <p className="preserve-lines">{quotation.message}</p>}
                <Link className="text-link" to="/quotations">
                  View my quotations →
                </Link>
              </div>
            ) : rfq.isOpen ? (
              <QuoteForm id={id} onSubmitted={reload} />
            ) : (
              <div className="quote-confirmation closed-note">
                <Clock3 size={28} />
                <h2>This request has closed.</h2>
                <p>
                  The quotation deadline has passed. Browse open requests to find another
                  opportunity.
                </p>
                <Link className="button secondary" to="/rfqs">
                  Browse RFQs
                </Link>
              </div>
            )}
          </aside>
        )}
      </div>
      {buyer && <BuyerQuotations id={id} />}
      {deleting && (
        <DeleteDialog
          rfq={rfq}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate('/rfqs')}
        />
      )}
    </>
  );
}
function QuoteForm({ id, onSubmitted }) {
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError(null);
    const result = quotationSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!result.success) {
      setErrors(fieldErrors(result.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api(`/rfqs/${id}/quotations`, { method: 'POST', body: result.data });
      onSubmitted();
    } catch (error) {
      setError(error);
      setErrors(error.fields || {});
      setBusy(false);
    }
  }
  return (
    <form
      className="form-card quote-form"
      noValidate
      onSubmit={submit}
      onChange={(event) => setErrors((current) => ({ ...current, [event.target.name]: undefined }))}
    >
      <div className="section-label">
        <Send size={18} />
        YOUR RESPONSE
      </div>
      <h2>Make your quotation.</h2>
      <p className="form-intro">Give the buyer a clear picture of your offer.</p>
      <Field
        label="Quoted price (USD)"
        name="price"
        errors={errors}
        hint="Total price for this request, not the per-unit price."
      >
        <input
          {...inputProps('price', errors, true)}
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0.00"
          required
        />
      </Field>
      <Field label="Estimated delivery time" name="deliveryTime" errors={errors}>
        <input
          {...inputProps('deliveryTime', errors)}
          maxLength={200}
          placeholder="e.g. 7–10 business days"
          required
        />
      </Field>
      <Field label="Message / notes (optional)" name="message" errors={errors}>
        <textarea
          {...inputProps('message', errors)}
          rows={4}
          maxLength={3000}
          placeholder="Add any details about your offer…"
        />
      </Field>
      {error && <ErrorState error={error} />}
      <SubmitButton busy={busy} busyText="Submitting…">
        Submit quotation
        <Send size={16} />
      </SubmitButton>
      <p className="form-footnote">
        One quotation per request. Submitted quotations cannot be edited.
      </p>
    </form>
  );
}
function BuyerQuotations({ id }) {
  const { data, loading, error, reload } = useResource(`/rfqs/${id}/quotations`);
  return (
    <section className="received-quotes">
      <div className="section-heading">
        <h2>Received quotations</h2>
        <span>Responses from suppliers</span>
      </div>
      {loading ? (
        <Loading label="Loading quotations…" />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : !data.quotations.length ? (
        <EmptyState title="Your next connection is on its way">
          Supplier quotations will appear here as they respond to your request.
        </EmptyState>
      ) : (
        <div className="quotation-grid">
          {data.quotations.map((quote) => (
            <article className="quotation-card" key={quote.id}>
              <div className="quote-card-top">
                <div className="supplier-name">
                  <span className="avatar">{quote.supplierName.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <h3>{quote.supplierName}</h3>
                    <span>Submitted {dateLabel(quote.createdAt)}</span>
                  </div>
                </div>
                <strong className="quote-price">{priceLabel(quote.price)}</strong>
              </div>
              <p className="delivery-time">
                <Clock3 size={16} />
                {quote.deliveryTime}
              </p>
              {quote.message ? (
                <p className="quote-message">{quote.message}</p>
              ) : (
                <p className="no-message">No additional notes.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
