import { PageShell } from '../components/Chrome'
import { publicIdentity } from '../config/identity'

const ownerGate = (
  <div className="legal-gate" role="note">
    <strong>Not approved for live trading.</strong> The intended Norwegian sole proprietorship is not registered and has no organisation number. Payments remain disabled until registration, VAT status, address, contact details and final Norwegian consumer wording are verified and owner approved.
  </div>
)

export default function LegalPage({ type }) {
  const privacy = type === 'privacy'
  return (
    <PageShell>
      <article className="legal-page">
        <p className="eyebrow">{privacy ? 'Privacy' : 'Purchase terms'}</p>
        <h1>{privacy ? 'Privacy notice — launch draft' : 'Custom-order terms — launch draft'}</h1>
        {ownerGate}
        {privacy ? (
          <>
            <section><h2>Controller and contact</h2><p>Privacy contact: <a href={`mailto:${publicIdentity.publicEmail}`}>{publicIdentity.publicEmail}</a>. <strong>Launch gate:</strong> the owner must approve the controller’s full legal identity and address before request intake opens. No organisation number exists yet.</p></section>
            <section><h2>Information collected</h2><p>Request details may include name, email, optional phone, delivery area, project description, dimensions, intended use, budget, preferred timing, uploaded reference files and consent metadata. Offer and payment records retain the exact accepted commercial version and provider references. Full card or wallet credentials are not collected by Bata Woodworks.</p></section>
            <section><h2>Purpose and access</h2><p>Information is used only to assess requests, prepare and deliver selected custom work, process verified payments, meet accounting or legal obligations, and send transactional status updates. Access is limited to authorized Bata management and contracted infrastructure providers needed for those purposes. <strong>Launch gate:</strong> the final notice must identify and explain the applicable lawful basis for each purpose.</p></section>
            <section><h2>Storage, retention and processors</h2><p><strong>Launch gate:</strong> approve the retention schedule and list the final hosting, email and payment processors after contracts and processing regions are confirmed. Attachments are held in private storage and customer offer links are token-protected.</p></section>
            <section><h2>Your rights and complaints</h2><p><strong>Launch gate:</strong> approve the request process and relevant supervisory-authority wording. The final notice must explain applicable access, correction, deletion, restriction and objection rights without overstating them.</p></section>
          </>
        ) : (
          <>
            <section><h2>Seller identity</h2><p>Bata Woodworks is the intended trading name. Public contact: <a href={`mailto:${publicIdentity.publicEmail}`}>{publicIdentity.publicEmail}</a>. <strong>Launch gate:</strong> the ENK is not registered, no organisation number exists, and the legal name, address, telephone and VAT status must be inserted only after verification.</p></section>
            <section><h2>How an order is formed</h2><p>A request is not an order and does not guarantee acceptance. The technical flow presents a clearly labelled payment action only for an active private offer and treats the order as paid only after server-side verification. The paid offer version records the exact scope, materials, finish, amount, VAT treatment, delivery terms, agreed production or delivery period, expiry and accepted terms. <strong>Launch gate:</strong> owner-approved Norwegian terms must define the legally applicable point of contract formation consistently with this flow.</p></section>
            <section><h2>Price, VAT and payment</h2><p>The private offer states the total payable amount, any delivery charge and the approved VAT treatment. The payment provider processes wallet or card credentials. A browser return page is not proof of payment.</p></section>
            <section><h2>Timing in a request</h2><p>Any preferred timing or date supplied with an inquiry is informational and non-binding. It helps assess whether a project is a fit; it does not create a deadline or production commitment.</p></section>
            <section><h2>Custom-made goods and withdrawal</h2><p>The final owner-approved terms must explain the statutory withdrawal-right exception where it lawfully applies to goods made to the customer’s specifications or clearly personalized. It must not claim a broader exception than the law permits.</p></section>
            <section><h2>Delivery, delay and changes</h2><p>The applicable production or delivery period is the agreed period in the specific paid private offer. A fixed delivery date exists only when that offer expressly states one. Any material change requires a new offer version; issued commercial terms are not silently edited.</p></section>
            <section><h2>Defects, complaints and reclamation</h2><p>Custom manufacture does not remove mandatory statutory defect, complaint or reclamation rights. <strong>Launch gate:</strong> approve the complaint process and the use of <a href={`mailto:${publicIdentity.ordersEmail}`}>{publicIdentity.ordersEmail}</a> before launch.</p></section>
            <section><h2>Cancellation and refunds</h2><p>The system records cancellation and refund states. <strong>Launch gate:</strong> approve the circumstances, timing and any lawful cost treatment; no real cancellation or refund is automated without the merchant process being configured.</p></section>
          </>
        )}
      </article>
    </PageShell>
  )
}
