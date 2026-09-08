import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout, type LegalSection } from "@/components/music/legal-page-layout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — MEVO" },
      {
        name: "description",
        content: "How MEVO handles information when you browse, search and stream music.",
      },
      { property: "og:title", content: "Privacy Policy — MEVO" },
      {
        property: "og:description",
        content: "How MEVO handles information when you stream music.",
      },
      { property: "og:url", content: "/privacy" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: PrivacyPage,
});

const LAST_UPDATED = "2 August 2026";

const sections: readonly LegalSection[] = [
  {
    id: "information-we-collect",
    heading: "1. Information We Collect",
    body: (
      <>
        <p>
          MEVO is a music streaming website. Browsing and listening do not require an account, and
          we do not ask visitors for personal details in order to play music.
        </p>
        <p>
          We handle: (i) information your browser sends automatically when it requests pages, audio
          files and artwork, such as IP address, user agent and requested URL, which our hosting and
          storage providers process to deliver the service; (ii) preferences stored locally in your
          own browser, such as the last played track, player visibility and recently played items;
          and (iii) anything you voluntarily write to us through the contact page.
        </p>
        <p>
          Administrator accounts exist for catalogue management only. Those credentials are handled
          by our backend provider and are not created for ordinary listeners.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    heading: "2. How We Use Information",
    body: (
      <p>
        We use information to deliver pages and audio, keep your player state consistent between
        visits, maintain security and stability of the platform, respond to messages you send us,
        and manage the music catalogue. We do not build advertising profiles.
      </p>
    ),
  },
  {
    id: "legal-bases",
    heading: "3. Legal Bases and User Choices",
    body: (
      <p>
        Where data protection law applies, we rely on our legitimate interest in operating a secure,
        functioning website, and on your consent where you choose to contact us. You can stop most
        local processing at any time by clearing site data in your browser or by not using the
        player.
      </p>
    ),
  },
  {
    id: "cookies-and-storage",
    heading: "4. Cookies and Local Storage",
    body: (
      <p>
        MEVO does not use advertising or tracking cookies. The player writes a small amount of data
        to your browser's local storage — for example the last selected song and whether you
        dismissed the bottom player — so that the experience is restored on your next visit. Our
        backend provider may also store a session token in browser storage when an administrator
        signs in. Clearing site data removes all of it.
      </p>
    ),
  },
  {
    id: "listening-activity",
    heading: "5. Music Playback and Listening Activity",
    body: (
      <p>
        Recently played tracks and playback preferences are kept in your own browser. We do not
        maintain a per-listener listening history tied to your identity, and we do not sell or share
        listening activity.
      </p>
    ),
  },
  {
    id: "third-party-services",
    heading: "6. Third-Party Services",
    body: (
      <>
        <p>
          MEVO runs on a managed cloud backend (Supabase) that provides the song database, file
          storage for audio and artwork, and authentication for administrators. The site itself is
          served by our web hosting provider.
        </p>
        <p>
          The site also loads web fonts from Google Fonts, and the footer links to external
          Instagram and Facebook profiles. Those providers process requests under their own privacy
          policies.
        </p>
      </>
    ),
  },
  {
    id: "how-information-is-shared",
    heading: "7. How Information Is Shared",
    body: (
      <p>
        We do not sell personal information. Limited information is shared only where genuinely
        necessary with our hosting, database and storage providers, with authentication
        infrastructure, with authorities where legally required, and where needed to protect MEVO,
        its users or platform security.
      </p>
    ),
  },
  {
    id: "data-retention",
    heading: "8. Data Retention",
    body: (
      <p>
        Server logs are retained by our providers for a limited period for security and diagnostics.
        Messages you send us are kept only as long as needed to handle your request. Data stored in
        your browser stays until you clear it.
      </p>
    ),
  },
  {
    id: "data-security",
    heading: "9. Data Security",
    body: (
      <p>
        Traffic is served over encrypted connections, and database access is restricted by row-level
        security rules so that only published catalogue content is publicly readable. No online
        service can guarantee absolute security, but we take reasonable measures to protect the
        platform.
      </p>
    ),
  },
  {
    id: "user-rights",
    heading: "10. User Rights and Controls",
    body: (
      <p>
        Depending on applicable law and on what we actually hold, you may request access to eligible
        personal information, correction of inaccurate information, deletion of eligible
        information, withdrawal of consent, or a copy of eligible information, and you may object to
        certain processing. You can clear browser-stored playback preferences yourself at any time.
        Contact us through the contact page to raise a privacy request.
      </p>
    ),
  },
  {
    id: "childrens-privacy",
    heading: "11. Children's Privacy",
    body: (
      <p>
        MEVO is not directed at young children and we do not knowingly collect personal information
        from them. If you believe a child has sent us personal information, contact us and we will
        remove it.
      </p>
    ),
  },
  {
    id: "external-links",
    heading: "12. External Links",
    body: (
      <p>
        The site links to external profiles and services we do not control. Their content and
        privacy practices are their own responsibility.
      </p>
    ),
  },
  {
    id: "international",
    heading: "13. International Data Processing",
    body: (
      <p>
        Our hosting, database and storage providers may process requests on servers located in other
        countries. By using MEVO you understand that technical data required to deliver the service
        may be processed outside your own country.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "14. Changes to This Privacy Policy",
    body: (
      <p>
        We may update this policy as the platform evolves. The "last updated" date above always
        reflects the current version, and continued use of MEVO after an update means you accept the
        revised policy.
      </p>
    ),
  },
  {
    id: "contact-us",
    heading: "15. Contact Us",
    body: (
      <p>
        Questions about this policy can be sent through the MEVO contact page, which lists our
        official contact details.
      </p>
    ),
  },
];

function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      intro="How MEVO handles information when you browse the site, search the catalogue, stream music and get in touch."
      lastUpdated={LAST_UPDATED}
      current="/privacy"
      sections={sections}
    />
  );
}
