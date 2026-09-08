import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, type LegalSection } from "@/components/music/legal-page-layout";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — MEVO" },
      {
        name: "description",
        content: "The rules that govern use of the MEVO website, music player and catalogue.",
      },
      { property: "og:title", content: "Terms of Use — MEVO" },
      {
        property: "og:description",
        content: "Rules governing use of the MEVO website and music player.",
      },
      { property: "og:url", content: "/terms" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: TermsPage,
});

const LAST_UPDATED = "2 August 2026";

const sections: readonly LegalSection[] = [
  {
    id: "acceptance",
    heading: "1. Acceptance of the Terms",
    body: (
      <p>
        By accessing MEVO or using its player, search, albums, artists, trending pages, queue or
        recently played features, you agree to these Terms of Use. If you do not agree, please stop
        using the service.
      </p>
    ),
  },
  {
    id: "eligibility",
    heading: "2. Eligibility",
    body: (
      <p>
        You may use MEVO only if you are able to form a binding agreement under the laws that apply
        to you, and only for lawful purposes.
      </p>
    ),
  },
  {
    id: "service",
    heading: "3. MEVO Service",
    body: (
      <p>
        MEVO is a web-based music streaming interface offering curated sections, album and artist
        pages, search, a playback queue and a persistent player. Features may be added, changed or
        removed as the platform develops.
      </p>
    ),
  },
  {
    id: "accounts",
    heading: "4. Administrator Accounts",
    body: (
      <p>
        Listening does not require an account. Administrator accounts exist solely for managing the
        catalogue; anyone holding such access is responsible for keeping their credentials
        confidential and for activity performed with them.
      </p>
    ),
  },
  {
    id: "permitted-use",
    heading: "5. Permitted Use and Limited Licence",
    body: (
      <p>
        You receive a personal, limited, non-exclusive, non-transferable and revocable licence to
        access MEVO for private, non-commercial listening. No other rights are granted.
      </p>
    ),
  },
  {
    id: "prohibited-conduct",
    heading: "6. Prohibited Conduct",
    body: (
      <>
        <p>You must not:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>copy or redistribute streamed content without authorisation;</li>
          <li>record, sell or commercially exploit content without permission;</li>
          <li>circumvent playback or security restrictions;</li>
          <li>scrape the site or its catalogue without permission;</li>
          <li>reverse-engineer the service;</li>
          <li>attempt unauthorised access to any part of the platform;</li>
          <li>upload or transmit malware or harmful code;</li>
          <li>manipulate playback counts or generate artificial traffic;</li>
          <li>use bots abusively;</li>
          <li>impersonate another person;</li>
          <li>infringe intellectual-property rights;</li>
          <li>disrupt the platform or other users;</li>
          <li>use MEVO for unlawful, fraudulent, abusive or otherwise harmful purposes.</li>
        </ul>
      </>
    ),
  },
  {
    id: "intellectual-property",
    heading: "7. Music, Artwork and Intellectual Property",
    body: (
      <p>
        Music, artwork, artist names, metadata, designs, software and logos available through MEVO
        may belong to MEVO, to artists, labels, publishers, licensors or other rights holders. MEVO
        does not claim ownership of third-party music. Streaming access does not transfer any
        ownership or licence beyond personal listening.
      </p>
    ),
  },
  {
    id: "copyright",
    heading: "8. Copyright Concerns",
    body: (
      <p>
        Rights holders who believe content on MEVO infringes their rights can reach us through the
        contact or support page. A useful notice identifies the protected work and the disputed
        content, provides contact information, includes a good-faith statement that the use is not
        authorised, and evidence of authority to act for the rights holder. We review such notices
        and may remove content while reviewing.
      </p>
    ),
  },
  {
    id: "user-content",
    heading: "9. User-Submitted Content",
    body: (
      <p>
        MEVO does not accept public uploads from visitors. Content you send us through the contact
        page is used only to handle your message, and you confirm you are entitled to share it.
      </p>
    ),
  },
  {
    id: "third-party",
    heading: "10. Third-Party Links and Services",
    body: (
      <p>
        The site links to external services such as social profiles and relies on third-party
        infrastructure providers. We are not responsible for the content or practices of those
        services.
      </p>
    ),
  },
  {
    id: "availability",
    heading: "11. Service Availability and Changes",
    body: (
      <p>
        MEVO is provided on an as-available basis. Access may be interrupted for maintenance,
        technical problems or reasons outside our control, and catalogue content may change at any
        time.
      </p>
    ),
  },
  {
    id: "termination",
    heading: "12. Suspension and Termination",
    body: (
      <p>
        We may restrict, suspend or terminate access where these Terms are breached, where security
        or platform integrity is at risk, or where required by law.
      </p>
    ),
  },
  {
    id: "disclaimers",
    heading: "13. Disclaimers",
    body: (
      <p>
        MEVO is provided without warranties of any kind, to the extent permitted by applicable law.
        We do not warrant uninterrupted playback, error-free operation or the accuracy of all
        catalogue metadata.
      </p>
    ),
  },
  {
    id: "liability",
    heading: "14. Limitation of Liability",
    body: (
      <p>
        To the extent permitted by applicable law, MEVO is not liable for indirect, incidental,
        special or consequential losses, or for loss of data or goodwill arising from use of, or
        inability to use, the service.
      </p>
    ),
  },
  {
    id: "violations",
    heading: "15. Responsibility for Violations",
    body: (
      <p>
        You are responsible for your own use of MEVO and for any consequences of breaching these
        Terms, including claims raised by third parties in relation to your use.
      </p>
    ),
  },
  {
    id: "governing-rules",
    heading: "16. Governing Rules",
    body: (
      <p>
        These Terms are governed by the laws applicable to the use of the service in your location
        and to MEVO's operation. Nothing here removes mandatory rights you may have under local law.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "17. Changes to These Terms",
    body: (
      <p>
        We may revise these Terms as MEVO develops. The "last updated" date above reflects the
        current version, and continued use after a change means you accept it.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "18. Contact",
    body: <p>Questions about these Terms can be sent through the MEVO contact page.</p>,
  },
];

function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms of Use"
      intro="The rules that govern your use of the MEVO website, player and catalogue."
      lastUpdated={LAST_UPDATED}
      current="/terms"
      sections={sections}
    />
  );
}
