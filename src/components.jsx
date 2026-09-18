import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  MapPin,
  Package,
  RefreshCw,
  Search,
  LoaderCircle,
  Inbox,
} from 'lucide-react';
import { api } from './api';

export const dateLabel = (value) =>
  new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
export const priceLabel = (value) =>
  new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(Number(value));
export const quantityLabel = (value) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(Number(value));

export function useResource(path) {
  const [state, setState] = useState({ data: null, loading: true, error: null, path });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null, path });
    api(path, { signal: controller.signal })
      .then((data) => setState({ data, loading: false, error: null, path }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ data: null, loading: false, error, path });
      });
    return () => controller.abort();
  }, [path, revision]);
  return {
    ...(state.path === path ? state : { data: null, loading: true, error: null }),
    reload: () => setRevision((value) => value + 1),
  };
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function ErrorState({ error, retry }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={22} />
      <div>
        <strong>We couldn’t complete that request</strong>
        <p>{error.message}</p>
        {retry && (
          <button className="button secondary small" onClick={retry}>
            <RefreshCw size={15} /> Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function EmptyState({ title, children, action, filtered = false }) {
  const Icon = filtered ? Search : Inbox;
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({ label, name, errors = {}, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={name}>{label}</label>
      {children}
      {errors[name] ? (
        <span className="field-error" id={`${name}-error`}>
          {errors[name]}
        </span>
      ) : hint ? (
        <span className="field-hint" id={`${name}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
export function inputProps(name, errors, hint = false) {
  return {
    id: name,
    name,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `${name}-error` : hint ? `${name}-hint` : undefined,
  };
}
export function SubmitButton({ busy, children, busyText = 'Saving…' }) {
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy ? (
        <>
          <LoaderCircle className="spin" size={17} />
          {busyText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
export function PageHeading({ eyebrow, title, children, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}
export function Status({ open }) {
  return (
    <span className={`status ${open ? 'open' : 'closed'}`}>
      <span />
      {open ? 'Open for quotes' : 'Deadline passed'}
    </span>
  );
}
export function RfqCard({ rfq, buyer, onDelete }) {
  return (
    <article className="rfq-card">
      <div className="card-top">
        <span className="product-icon">
          <Package size={21} />
        </span>
        <Status open={rfq.isOpen} />
      </div>
      <h2>
        <Link to={`/rfqs/${rfq.id}`}>{rfq.productName}</Link>
      </h2>
      <p className="card-description">{rfq.description}</p>
      <dl className="card-meta">
        <div>
          <dt>
            <Package size={15} /> Quantity
          </dt>
          <dd>{quantityLabel(rfq.quantity)}</dd>
        </div>
        <div>
          <dt>
            <MapPin size={15} /> Location
          </dt>
          <dd>{rfq.deliveryLocation}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={15} /> Deadline
          </dt>
          <dd>{dateLabel(rfq.deadline)}</dd>
        </div>
      </dl>
      <div className="card-footer">
        <Link className="text-link" to={`/rfqs/${rfq.id}`}>
          View details <ArrowRight size={16} />
        </Link>
        {buyer && (
          <div className="card-actions">
            <Link to={`/rfqs/${rfq.id}/edit`}>Edit</Link>
            <button onClick={() => onDelete(rfq)}>Delete</button>
          </div>
        )}
      </div>
    </article>
  );
}

export function DeleteDialog({ rfq, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    return () => previousFocus?.focus();
  }, []);
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/rfqs/${rfq.id}`, { method: 'DELETE', body: {} });
      onDeleted();
    } catch (error) {
      setError(error);
      setBusy(false);
    }
  }
  return (
    <dialog
      open
      className="dialog"
      aria-labelledby="delete-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      ref={(node) => {
        if (node && !node.dataset.modal) {
          node.close();
          node.showModal();
          node.dataset.modal = 'true';
        }
      }}
    >
      <div className="dialog-body">
        <span className="danger-icon">
          <AlertCircle size={25} />
        </span>
        <h2 id="delete-title">Delete this RFQ?</h2>
        <p>
          <strong>{rfq.productName}</strong> and all of its quotations will be permanently removed.
        </p>
        {error && <ErrorState error={error} />}
        <div className="form-actions">
          <button autoFocus className="button secondary" onClick={onClose} disabled={busy}>
            Keep RFQ
          </button>
          <button className="button danger" onClick={remove} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete RFQ'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
