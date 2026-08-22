import { PageShell } from '../components/Chrome'

const ownerGate = (
  <div className="legal-gate" role="note">
    <strong>Not approved for live trading.</strong> The owner must supply and approve the legal identity, organization number, VAT status, address, contact details and final wording before payments are enabled.
  </div>
)

export default function LegalPage({ type }) {
  const privacy = type === 'privacy'
  return (
    <PageShell>
      <article className="legal-page">
        <p className="eyebrow">{privacy ? 'Privacy' : 'Purchase terms'}</p>
        <h1>{privacy ? 'Privacy notice structure' : 'Custom-order terms structure'}</h1>
        {ownerGate}
        {privacy ? (
          <>
            <section><h2>Controller and contact</h2><p><strong>needs_owner:</strong> verified legal business identity, organization number, business address and privacy contact.</p></section>
            <section><h2>Information collected</h2><p>Request details may include name, email, optional phone, delivery area, project description, dimensions, intended use, budget, preferred timing, uploaded reference files and consent metadata. Offer and payment records retain the exact accepted commercial version and provider references. Full card or wallet credentials are not collected by Bata Woodworks.</p></section>
            <section><h2>Purpose and access</h2><p>Information is used only to assess requests, prepare and deliver selected custom work, process verified payments, meet accounting or legal obligations, and send transactional status updates. Access is limited to authorized Bata management and contracted infrastructure providers needed for those purposes.</p></section>
            <section><h2>Storage, retention and processors</h2><p><strong>needs_owner:</strong> approve the retention schedule and list the final hosting, email and payment processors after contracts and regions are confirmed. Attachments are held in private storage and customer offer links are token-protected.</p></section>
            <section><h2>Your rights and complaints</h2><p><strong>needs_owner:</strong> add the verified privacy contact, response process and relevant supervisory authority details. The final notice must explain applicable access, correction, deletion, restriction and objection rights without overstating them.</p></section>
          </>
        ) : (
          <>
            <section><h2>Seller identity</h2><p><strong>needs_owner:</strong> verified legal business name, organization number, VAT status, business address, email and telephone contact.</p></section>
            <section><h2>How an order is formed</h2><p>A request is not an order and does not guarantee acceptance. An order is formed only when the customer uses the clearly labelled payment action for an active private offer and payment is verified server-side. The paid offer version records the exact scope, materials, finish, amount, VAT treatment, delivery terms, agreed production or delivery period, expiry and accepted terms.</p></section>
            <section><h2>Price, VAT and payment</h2><p>The private offer states the total payable amount, any delivery charge and the approved VAT treatment. The payment provider processes wallet or card credentials. A browser return page is not proof of payment.</p></section>
            <section><h2>Timing in a request</h2><p>Any preferred timing or date supplied with an inquiry is informational and non-binding. It helps assess whether a project is a fit; it does not create a deadline or production commitment.</p></section>
            <section><h2>Custom-made goods and withdrawal</h2><p>The final owner-approved terms must explain the statutory withdrawal-right exception where it lawfully applies to goods made to the customer’s specifications or clearly personalized. It must not claim a broader exception than the law permits.</p></section>
            <section><h2>Delivery, delay and changes</h2><p>The applicable production or delivery period is the agreed period in the specific paid private offer. A fixed delivery date exists only when that offer expressly states one. Any material change requires a new offer version; issued commercial terms are not silently edited.</p></section>
            <section><h2>Defects, complaints and reclamation</h2><p>Custom manufacture does not remove mandatory statutory defect, complaint or reclamation rights. <strong>needs_owner:</strong> approve the complaint contact and operational handling process before launch.</p></section>
            <section><h2>Cancellation and refunds</h2><p>The system records cancellation and refund states. <strong>needs_owner:</strong> approve the circumstances, timing and any lawful cost treatment; no real cancellation or refund is automated without the merchant process being configured.</p></section>
          </>
        )}
      </article>
    </PageShell>
  )
}
