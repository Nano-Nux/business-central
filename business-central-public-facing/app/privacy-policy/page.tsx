import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { legalEmail } from "@/lib/legal";

const description =
  "How Nanonux Business Central handles website visits, AI support conversations, appointment details and Google Calendar information.";
export const metadata: Metadata = {
  title: "Privacy Policy",
  description,
  alternates: { canonical: "/privacy-policy" },
  openGraph: {
    title: "Privacy Policy | Nanonux Business Central",
    description,
    url: "/privacy-policy",
    type: "website",
  },
  twitter: { title: "Privacy Policy | Nanonux Business Central", description },
};

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "Who we are and what this covers",
    content: (
      <>
        <p>
          Nanonux operates the Business Central public website and its AI
          receptionist and demo/support booking service. This policy explains
          how those services handle information about visitors and the Google
          account an authorized Nanonux administrator connects for scheduling.
        </p>
        <p>
          Contact us at <a href={`mailto:${legalEmail}`}>{legalEmail}</a>. This
          policy does not replace a separate agreement or privacy notice for
          merchant workspaces, POS systems, mobile deployments or a merchant’s
          own customers. Website visitors do not need to sign in with Google to
          request an appointment.
        </p>
      </>
    ),
  },
  {
    id: "information",
    title: "Information we collect",
    content: (
      <>
        <ul>
          <li>
            <strong>Support conversations:</strong> messages you submit, AI
            replies, conversation identifiers, timestamps and appointment
            options associated with the conversation.
          </li>
          <li>
            <strong>Booking information:</strong> your name and email, optional
            company and discussion notes, selected time and timezone, consent to
            confirm the appointment, booking status, and calendar/event
            references needed to manage the request.
          </li>
          <li>
            <strong>Google integration information:</strong> the connected
            calendar identifier, authorization credentials, busy intervals used
            to calculate availability, and identifiers, status and links for
            booking events the service creates or checks.
          </li>
          <li>
            <strong>Technical information:</strong> request information such as
            IP address, request time and route, and operational or security logs
            processed by our servers and hosting providers.
          </li>
          <li>
            <strong>Direct communications:</strong> information you choose to
            send us by email or another published contact channel.
          </li>
        </ul>
        <p>
          Please do not submit passwords, payment-card information, health
          records, sensitive personal information or confidential business
          records through the public chat.
        </p>
      </>
    ),
  },
  {
    id: "purposes",
    title: "How we use information",
    content: (
      <>
        <p>
          We use this information to answer product and support questions, check
          appointment availability, create and reconcile appointments you
          explicitly confirm, respond to inquiries, and protect the service from
          errors, duplicate bookings and abuse. Authorized Nanonux platform
          administrators can review support transcripts and booking details to
          respond to requests and operate the service.
        </p>
        <p>
          We do not sell personal information or use Google Calendar information
          for targeted advertising, data brokerage, credit decisions or
          unrelated profiling. Requesting a demo does not enroll you in an
          unrelated marketing mailing list.
        </p>
      </>
    ),
  },
  {
    id: "google-calendar",
    title: "Google Calendar access and permissions",
    content: (
      <>
        <p>
          An authorized Nanonux administrator chooses whether to connect a
          Google account and selects the booking calendar. The integration
          requests Google’s <code>calendar.events</code> and{" "}
          <code>calendar.events.freebusy</code> permissions. These permit access
          to calendar events and availability; our scheduling workflow uses them
          to check busy periods, create confirmed demo/support appointments and
          look up its booking events to reconcile retries.
        </p>
        <p>
          The current workflow does not request Gmail, Google Drive or Google
          Contacts permissions, browse unrelated calendar events, or implement
          calendar deletion or rescheduling through the AI. The permission
          Google displays may be broader than the operations currently
          implemented; the administrator should review that consent screen
          before granting access.
        </p>
        <p>
          When you confirm a booking, we send your name, email, optional
          company/notes and appointment details to Google Calendar to create an
          event and request an invitation. The calendar owner and people with
          access to that calendar may see those details. Google controls
          invitation delivery, and recipients may retain copies.
        </p>
        <p>
          The administrator can disconnect Calendar in Nanonux Admin or revoke
          access through{" "}
          <a
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Account connections
          </a>
          . Disconnecting removes our stored calendar credential; it does not
          automatically delete transcripts, booking records or events already
          created in Google Calendar.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI processing and free Gemini services",
    content: (
      <>
        <p>
          The receptionist uses Google’s Gemini API to generate replies.
          Submitted chat messages, relevant conversation history, approved
          support information and scheduling context are sent to Gemini.
          Scheduling context can include offered times, timezone, booking status
          and booking references. OAuth credentials are not included in model
          prompts. Avoid including personal or confidential information in chat;
          provide booking contact details in the booking controls instead.
        </p>
        <p>
          <strong>
            Our planned production configuration uses the free Gemini API.
          </strong>{" "}
          Under Google’s unpaid-services terms, Google may use submitted content
          and generated responses to provide, improve and develop its products
          and machine-learning technologies, and human reviewers may process
          that content. We cannot promise that free-tier chat content is
          excluded from model improvement. Google instructs developers not to
          submit sensitive, confidential or personal information to unpaid
          services.
        </p>
        <p>
          See the{" "}
          <a
            href="https://ai.google.dev/gemini-api/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            Gemini API terms
          </a>{" "}
          and{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Privacy Policy
          </a>
          . You can choose not to use AI chat and contact Nanonux directly
          instead. AI responses may be incorrect; booking confirmation is
          established by the booking service, not by a chat statement.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Service providers and disclosure",
    content: (
      <>
        <p>
          Information is processed by providers that deliver the features you
          use: Google Gemini for AI replies, Google Calendar for scheduling,
          email providers for direct correspondence and calendar invitations,
          and infrastructure providers for hosting, database/storage, network
          delivery and security.
        </p>
        <p>
          We may disclose information when reasonably necessary to comply with
          applicable law, respond to lawful requests, protect rights or
          investigate fraud and security incidents. Any transfer of Google API
          information must remain limited to permitted purposes under the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>{" "}
          and the{" "}
          <a
            href="https://developers.google.com/workspace/workspace-api-user-data-developer-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Workspace API user data policy
          </a>
          , including applicable Limited Use restrictions. This disclosure does
          not claim that Google has verified or approved Nanonux.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    title: "Browser storage and security",
    content: (
      <>
        <p>
          The receptionist uses browser session storage to keep a conversation
          access token and, while needed, a pending booking request so a page
          reload can recover the request without creating a second appointment.
          Closing the tab or clearing browser storage may remove local access to
          the conversation; it does not delete server records. Starting a new
          conversation likewise does not erase prior transcripts.
        </p>
        <p>
          The Google connection flow uses a short-lived security cookie to
          validate authorization. The website does not currently install
          advertising trackers or analytics cookies. Hosting and security
          providers may process technical request information to deliver and
          protect the service.
        </p>
        <p>
          Calendar refresh credentials are encrypted in the backend. Public
          conversation access requires a random access token, and
          transcript/booking administration requires an authenticated platform
          administrator. Production connections should use HTTPS. These controls
          reduce risk but do not make any internet service completely secure.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Retention, deletion and your choices",
    content: (
      <>
        <p>
          We retain support and booking records to respond to requests, operate
          appointments, investigate issues and meet applicable obligations. The
          current service does not automatically purge transcripts or booking
          history. A conversation access token expires after 30 days; token
          expiry is not a deletion deadline. Calendar credentials remain until
          disconnected, replaced or removed by an administrator.
        </p>
        <p>
          You may request access, correction or deletion, or withdraw a request
          or consent, by emailing{" "}
          <a href={`mailto:${legalEmail}`}>{legalEmail}</a>. Provide the email
          used for booking and an approximate date or booking reference if
          available. We may need to verify your identity and may retain
          information required for legal, security or dispute-related reasons.
          Deletion requests are handled by the team; there is no self-service
          transcript deletion control.
        </p>
        <p>
          Deleting our records does not automatically erase copies held by
          Google, invitation recipients or your email provider. Provider
          retention is governed by their terms; ask us about removing an
          organizer’s calendar event. Copies in backups may persist until those
          backups are replaced.
        </p>
      </>
    ),
  },
  {
    id: "international",
    title: "Location, eligibility and policy changes",
    content: (
      <>
        <p>
          Nanonux and its providers may process information in countries other
          than your own. Protections and legal requirements may differ. Contact
          us about privacy rights available under the law that applies to you;
          nothing in this policy removes mandatory rights.
        </p>
        <p>
          The AI receptionist is intended for adults aged 18 or older using it
          for business purposes. It is not intended for children. If you believe
          a child has submitted personal information, contact us so we can
          review and address it.
        </p>
        <p>
          We will update this page when our practices change and revise its
          effective date. Material changes to Google data use require
          appropriate notice and renewed consent before that new use. Please
          also read our <Link href="/terms-of-service">Terms of Service</Link>.
        </p>
      </>
    ),
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      introduction="How Nanonux handles information when you explore Business Central, ask a question or arrange a call with our team."
      summary="You choose what to share. Booking requires your confirmation, Google Calendar access is connected by an administrator, and you can contact us to request access, correction or deletion."
      sections={sections}
    />
  );
}
