import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, FileText } from 'lucide-react';
import { api } from '../api';
import {
  ErrorState,
  Field,
  inputProps,
  Loading,
  PageHeading,
  SubmitButton,
  useResource,
} from '../components';
import { fieldErrors, rfqSchema, todayUTC } from '../../shared/validation';

export default function RfqForm() {
  const { id } = useParams();
  return id ? <EditRfq id={id} /> : <Form />;
}
function EditRfq({ id }) {
  const { data, loading, error, reload } = useResource(`/rfqs/${id}`);
  if (loading) return <Loading label="Loading your request…" />;
  if (error) return <ErrorState error={error} retry={reload} />;
  return <Form key={id} rfq={data.rfq} />;
}
function Form({ rfq }) {
  const navigate = useNavigate();
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError(null);
    const result = rfqSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!result.success) {
      setErrors(fieldErrors(result.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const data = await api(rfq ? `/rfqs/${rfq.id}` : '/rfqs', {
        method: rfq ? 'PUT' : 'POST',
        body: result.data,
      });
      navigate(`/rfqs/${data.rfq.id}`, {
        state: {
          notice: rfq
            ? 'Your request has been updated.'
            : 'Your request is published and ready for quotations.',
        },
      });
    } catch (error) {
      setError(error);
      setErrors(error.fields || {});
      setBusy(false);
    }
  }
  const tomorrow = new Date(`${todayUTC()}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return (
    <>
      <Link className="back-link" to={rfq ? `/rfqs/${rfq.id}` : '/rfqs'}>
        <ArrowLeft size={16} />
        {rfq ? 'Back to request' : 'Back to my RFQs'}
      </Link>
      <PageHeading
        eyebrow="REQUEST FOR QUOTATION"
        title={rfq ? 'Refine your request.' : 'Tell us what you need.'}
      >
        {rfq
          ? 'Keep your requirements clear and up to date.'
          : 'A few useful details are the start of a good supplier connection.'}
      </PageHeading>
      <div className="form-layout">
        <form
          className="form-card"
          noValidate
          onSubmit={submit}
          onChange={(event) =>
            setErrors((current) => ({ ...current, [event.target.name]: undefined }))
          }
        >
          <div className="form-card-heading">
            <FileText size={20} />
            <div>
              <h2>Request details</h2>
              <p>All fields are required.</p>
            </div>
          </div>
          <Field label="Product or service name" name="productName" errors={errors}>
            <input
              {...inputProps('productName', errors)}
              defaultValue={rfq?.productName}
              maxLength={160}
              placeholder="e.g. Recycled cardboard packaging"
              required
            />
          </Field>
          <Field
            label="Description"
            name="description"
            errors={errors}
            hint="Include specifications, materials or any details a supplier needs."
          >
            <textarea
              {...inputProps('description', errors, true)}
              defaultValue={rfq?.description}
              maxLength={5000}
              rows={5}
              placeholder="Describe your requirement…"
              required
            />
          </Field>
          <div className="form-row">
            <Field
              label="Quantity"
              name="quantity"
              errors={errors}
              hint="Include the unit (pieces, kg, hours) in your description."
            >
              <input
                {...inputProps('quantity', errors, true)}
                type="number"
                min="0.001"
                step="0.001"
                defaultValue={rfq?.quantity}
                placeholder="e.g. 500"
                required
              />
            </Field>
            <Field
              label="Quotation deadline (UTC)"
              name="deadline"
              errors={errors}
              hint="The request closes at the start of this date (00:00 UTC)."
            >
              <input
                {...inputProps('deadline', errors, true)}
                type="date"
                min={tomorrow.toISOString().slice(0, 10)}
                defaultValue={rfq?.deadline}
                required
              />
            </Field>
          </div>
          <Field label="Delivery location" name="deliveryLocation" errors={errors}>
            <input
              {...inputProps('deliveryLocation', errors)}
              defaultValue={rfq?.deliveryLocation}
              maxLength={200}
              placeholder="e.g. Bengaluru, Karnataka"
              required
            />
          </Field>
          {error && <ErrorState error={error} />}
          <div className="form-actions">
            <Link className="button secondary" to={rfq ? `/rfqs/${rfq.id}` : '/rfqs'}>
              Cancel
            </Link>
            <SubmitButton busy={busy}>
              {rfq ? 'Save changes' : 'Publish RFQ'}
              <Check size={17} />
            </SubmitButton>
          </div>
        </form>
        <aside className="form-aside">
          <span className="aside-icon">
            <FileText size={25} />
          </span>
          <h2>
            Good details.
            <br />
            Better quotations.
          </h2>
          <p>Help suppliers understand exactly what you’re looking for.</p>
          <ul>
            <li>Use a specific product or service name.</li>
            <li>Include quantities, units and specifications.</li>
            <li>Choose a realistic quotation deadline.</li>
          </ul>
          <div className="aside-note">
            {rfq
              ? 'Existing quotations will remain attached to this request.'
              : 'Your request will be visible to suppliers as soon as you publish it.'}
          </div>
        </aside>
      </div>
    </>
  );
}
