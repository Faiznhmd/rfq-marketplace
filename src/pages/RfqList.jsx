import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, MapPin, Plus, Search } from 'lucide-react';
import { useAuth } from '../auth';
import {
  DeleteDialog,
  EmptyState,
  ErrorState,
  Loading,
  PageHeading,
  RfqCard,
  useResource,
} from '../components';

export default function RfqList() {
  const { user } = useAuth();
  const buyer = user.role === 'BUYER';
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const location = params.get('location') || '';
  const { data, loading, error, reload } = useResource(
    buyer ? '/rfqs/my' : `/rfqs?${new URLSearchParams({ q, location })}`,
  );
  const [deleting, setDeleting] = useState(null);
  const [notice, setNotice] = useState('');
  function search(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setParams(Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim())));
  }
  return (
    <>
      <PageHeading
        eyebrow={buyer ? 'BUYER WORKSPACE' : 'SUPPLIER WORKSPACE'}
        title={buyer ? 'Your next great connection.' : 'Find your next opportunity.'}
        action={
          buyer && (
            <Link className="button primary" to="/rfqs/new">
              <Plus size={18} />
              Create RFQ
            </Link>
          )
        }
      >
        {buyer
          ? 'Manage your requests and keep every supplier quotation in one place.'
          : 'Explore open requests and put your expertise to work.'}
      </PageHeading>
      <section className="intro-strip">
        <span className="intro-number">{buyer ? '01' : '→'}</span>
        <div>
          <strong>
            {buyer
              ? 'A clear request makes all the difference.'
              : 'The right request. The right response.'}
          </strong>
          <p>
            {buyer
              ? 'Include the details suppliers need to send you a useful quotation.'
              : 'Search by what you supply and where you can deliver.'}
          </p>
        </div>
        <span className="intro-decoration" aria-hidden="true">
          <ArrowRight size={28} />
        </span>
      </section>
      {!buyer && (
        <form className="search-panel" onSubmit={search} key={`${q}|${location}`}>
          <div className="search-field">
            <label htmlFor="q">Keyword</label>
            <div>
              <Search size={18} />
              <input
                id="q"
                name="q"
                defaultValue={q}
                maxLength={160}
                placeholder="Search products or services"
              />
            </div>
          </div>
          <div className="search-field">
            <label htmlFor="location">Delivery location</label>
            <div>
              <MapPin size={18} />
              <input
                id="location"
                name="location"
                defaultValue={location}
                maxLength={200}
                placeholder="City or region"
              />
            </div>
          </div>
          <button className="button primary" type="submit">
            Search RFQs
          </button>
          {(q || location) && (
            <button className="clear-search" type="button" onClick={() => setParams({})}>
              Clear filters
            </button>
          )}
        </form>
      )}
      <div className="section-heading">
        <h2>{buyer ? 'My requests for quotation' : 'Available requests'}</h2>
        <span>{buyer ? 'Your sourcing, organized' : 'Open requests from buyers'}</span>
      </div>
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <Loading label="Loading requests…" />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : !data.rfqs.length ? (
        <EmptyState
          title={
            buyer
              ? 'Your first request starts here'
              : q || location
                ? 'No matching requests'
                : 'No open requests yet'
          }
          filtered={Boolean(q || location)}
          action={
            buyer ? (
              <Link className="button primary" to="/rfqs/new">
                <Plus size={17} />
                Create your first RFQ
              </Link>
            ) : (
              (q || location) && (
                <button className="button secondary" onClick={() => setParams({})}>
                  Clear filters
                </button>
              )
            )
          }
        >
          {buyer
            ? 'Tell suppliers what you need. Your requests and incoming quotations will appear here.'
            : q || location
              ? 'Try a different keyword or delivery location.'
              : 'New requests will appear here when buyers publish them. Check back soon.'}
        </EmptyState>
      ) : (
        <div className="rfq-grid">
          {data.rfqs.map((rfq) => (
            <RfqCard key={rfq.id} rfq={rfq} buyer={buyer} onDelete={setDeleting} />
          ))}
        </div>
      )}
      {deleting && (
        <DeleteDialog
          rfq={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setNotice('RFQ deleted successfully.');
            reload();
          }}
        />
      )}
    </>
  );
}
