import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { legalEmail } from "@/lib/legal";

const description =
  "Terms for using the Nanonux Business Central website, AI receptionist and demo/support appointment booking service.";
export const metadata: Metadata = {
  title: "Terms of Service",
  description,
  alternates: { canonical: "/terms-of-service" },
  openGraph: {
    title: "Terms of Service | Nanonux Business Central",
    description,
    url: "/terms-of-service",
    type: "website",
  },
  twitter: {
    title: "Terms of Service | Nanonux Business Central",
    description,
  },
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "About these terms",
    content: (
      <>
        <p>
          These terms govern your use of the Nanonux Business Central public
          website, AI receptionist and demo/support appointment service. Nanonux
          is the operator. Contact us at{" "}
          <a href={`mailto:${legalEmail}`}>{legalEmail}</a>. By using these
          services, you agree to these terms. If you do not agree, do not use
          the services.
        </p>
        <p>
          Paid subscriptions, merchant workspaces, POS/mobile deployments,
          implementation work and service-level commitments require their own
          agreement. A visit, chat or demo booking does not create a paid
          subscription or purchase agreement. Your information is handled as
          described in our <Link href="/privacy-policy">Privacy Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Eligibility and responsible use",
    content: (
      <>
        <p>
          The AI receptionist and booking service are intended for adults aged
          18 or older making legitimate business inquiries. You must have
          authority to provide information and, if acting for an organization,
          to make the request on its behalf.
        </p>
        <ul>
          <li>
            Use accurate contact details and submit only information you are
            entitled to share.
          </li>
          <li>
            Do not impersonate others, submit unlawful content, spam the service
            or create misleading appointments.
          </li>
          <li>
            Do not attempt unauthorized access, extract another visitor’s
            conversation, bypass rate limits or interfere with the website or
            its providers.
          </li>
          <li>
            Do not use the chat to submit passwords, payment-card information,
            sensitive personal data or confidential records.
          </li>
        </ul>
        <p>
          We may limit or suspend access when reasonably necessary to prevent
          misuse, address security issues or comply with law.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI support and website information",
    content: (
      <>
        <p>
          The receptionist is an automated AI service, not a human employee.
          Responses can be incomplete or incorrect and should not be relied on
          as legal, financial, medical or other professional advice. Confirm
          important product, pricing, compatibility and contractual details
          directly with the Nanonux team before making a decision.
        </p>
        <p>
          AI statements do not independently authorize discounts, create
          contracts, provision accounts, guarantee availability or confirm
          appointments. The service cannot access your merchant workspace
          through the public receptionist. It does not currently cancel or
          reschedule appointments through chat.
        </p>
        <p>
          Website demonstrations, calculators, estimates and performance
          descriptions illustrate possible use cases; they are not guarantees of
          your results. Features, availability and prices may change. The terms
          of an accepted written order or separate service agreement govern any
          purchase.
        </p>
        <p>
          The free Gemini API processes chat content under Google’s
          unpaid-services terms, including its data-use practices described in
          our Privacy Policy. Use direct email instead of AI chat for personal
          or confidential correspondence.
        </p>
      </>
    ),
  },
  {
    id: "booking",
    title: "Appointments and confirmation",
    content: (
      <>
        <p>
          Available times are shown in the displayed business timezone and may
          change before confirmation. Selecting a time or discussing it in chat
          does not reserve or confirm an appointment. You must submit the
          required contact information and explicitly confirm the appointment
          and sharing with Nanonux and Google Calendar.
        </p>
        <p>
          An appointment is confirmed only when the booking service returns a
          confirmed result. If a request is pending or its outcome is uncertain,
          use the existing retry control to check that request rather than
          creating another appointment. Google controls invitation delivery; a
          requested invitation does not guarantee delivery or acceptance.
        </p>
        <p>
          For changes, cancellation, access requirements or questions about a
          meeting, contact <a href={`mailto:${legalEmail}`}>{legalEmail}</a>. An
          appointment does not guarantee a particular product, price, outcome or
          continued availability of the service.
        </p>
      </>
    ),
  },
  {
    id: "google",
    title: "Google connection and third-party services",
    content: (
      <>
        <p>
          Only an authorized Nanonux administrator should connect the Google
          account used for scheduling. The administrator must have the right to
          use the selected calendar, review requested permissions and protect
          the account. Access can be disconnected in Admin or revoked through
          Google Account connections.
        </p>
        <p>
          Google Calendar, Gemini, email and hosting providers operate under
          their own applicable terms. Their availability, restrictions and
          processing practices can affect this service. Nanonux does not control
          third-party outages, rate limits, invitation delivery or external
          account restrictions. Linking to a provider does not mean that
          provider endorses or has verified Nanonux.
        </p>
      </>
    ),
  },
  {
    id: "content",
    title: "Your content and our materials",
    content: (
      <>
        <p>
          You retain rights you hold in information you submit. You grant
          Nanonux the permission needed to receive, store, process and share
          that information to answer your inquiry, arrange your requested
          appointment and operate the service, as described in the Privacy
          Policy. This is not a transfer of ownership.
        </p>
        <p>
          Nanonux and its licensors retain rights in the website, branding,
          software and materials. You may browse the website and use its public
          features for their intended purposes. These terms do not grant a right
          to resell the service, misuse our branding or copy protected materials
          beyond what applicable law allows.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability and limitations",
    content: (
      <>
        <p>
          We aim to provide useful and reliable services but may modify,
          maintain, restrict or discontinue public features. The website and
          free public support features are provided as available, without a
          promise of uninterrupted access, error-free AI responses or a
          particular response time.
        </p>
        <p>
          To the extent permitted by applicable law, we do not give warranties
          or accept liability for indirect losses arising from reliance on AI
          output, missed invitations, third-party failures or interruptions to
          these free public features. Nothing in these terms excludes liability
          that cannot lawfully be excluded or limits your mandatory consumer or
          other statutory rights. A separate paid agreement may provide
          different protections.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes, concerns and contact",
    content: (
      <>
        <p>
          We may update these terms as the public service changes. The effective
          date identifies the current version. Material changes will be
          communicated as required by applicable law; changes do not remove
          rights or obligations already established by a separate agreement.
        </p>
        <p>
          If you have a concern, contact{" "}
          <a href={`mailto:${legalEmail}`}>{legalEmail}</a> with relevant
          details so we can try to resolve it. Applicable mandatory law governs
          your rights, and these terms do not require you to give up a right to
          use a court or regulator available under that law.
        </p>
      </>
    ),
  },
];

export default function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      introduction="The terms for exploring Business Central, using our AI support and arranging a demo or support call with Nanonux."
      summary="Public chat and booking help you contact our team. A selected time is confirmed only after the booking service confirms it; purchases and merchant services require a separate agreement."
      sections={sections}
    />
  );
}
