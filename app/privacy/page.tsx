import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Tracklist",
  description: "How Tracklist collects, uses, and protects your data.",
};

const CONTACT_EMAIL = "singh.avi99@gmail.com";
const EFFECTIVE_DATE = "May 21, 2025";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-zinc-500">Effective date: {EFFECTIVE_DATE}</p>
      </div>

      <div className="space-y-10">

        <Section title="Overview">
          <p>
            Tracklist is a music social platform that lets you log listens, rate albums, follow
            friends, and discover music. This policy explains what information we collect, why we
            collect it, and how you can control it. We don't sell your data. We don't run ads.
          </p>
        </Section>

        <Section title="Information we collect">
          <p><span className="text-zinc-200 font-medium">Account information.</span> When you sign
            in with Google or Apple we receive your email address and, optionally, your name and
            profile photo. We use your email only to identify your account — we don't send
            marketing email.</p>

          <p><span className="text-zinc-200 font-medium">Username and profile.</span> You choose a
            username, write an optional bio, and upload a profile photo. This information is
            publicly visible on your profile.</p>

          <p><span className="text-zinc-200 font-medium">Listening history.</span> When you log a
            listen manually or sync with Last.fm, we store the track, artist, album, and timestamp
            of each play. This data powers your charts, taste profile, and social feed.</p>

          <p><span className="text-zinc-200 font-medium">Ratings and reviews.</span> Star ratings
            and written reviews you submit for albums and tracks are stored and publicly visible.</p>

          <p><span className="text-zinc-200 font-medium">Last.fm connection.</span> If you connect
            a Last.fm account, we store your Last.fm username and import your listening history
            from their API. We don't store your Last.fm password.</p>

          <p><span className="text-zinc-200 font-medium">Spotify connection.</span> If you connect
            Spotify, we use the Spotify API to look up album and track metadata. We don't read
            your Spotify listening history without your permission.</p>

          <p><span className="text-zinc-200 font-medium">Preferred genres.</span> During
            onboarding you choose music genres you enjoy. This is used to personalise your
            experience.</p>

          <p><span className="text-zinc-200 font-medium">Social activity.</span> Follows,
            community memberships, and interactions with other users are stored to power the social
            features of the app.</p>

          <p><span className="text-zinc-200 font-medium">Push notification token.</span> If you
            grant notification permission, we store a device token to send you notifications. You
            can disable this in your device settings at any time.</p>

          <p><span className="text-zinc-200 font-medium">Usage data.</span> Like most web services,
            our hosting provider (Vercel) records standard server logs including IP addresses and
            request paths. These are used for security and debugging and are not linked to your
            profile.</p>
        </Section>

        <Section title="How we use your information">
          <p>We use the information above solely to operate Tracklist:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Authenticate you and keep your account secure</li>
            <li>Display your listening history, charts, and taste profile</li>
            <li>Power social features: feeds, follows, communities, leaderboards</li>
            <li>Send push notifications you've opted into</li>
            <li>Improve the app based on aggregate, anonymised usage patterns</li>
          </ul>
          <p>We do not use your data for advertising, and we do not sell or rent your data to
            third parties.</p>
        </Section>

        <Section title="Third-party services">
          <p>Tracklist relies on the following services to operate:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><span className="text-zinc-200">Supabase</span> — database and authentication infrastructure. Your data is stored on Supabase servers.</li>
            <li><span className="text-zinc-200">Google</span> — Sign in with Google. Governed by Google's privacy policy.</li>
            <li><span className="text-zinc-200">Apple</span> — Sign in with Apple. Governed by Apple's privacy policy.</li>
            <li><span className="text-zinc-200">Last.fm</span> — if connected, we fetch your listening history via the Last.fm API.</li>
            <li><span className="text-zinc-200">Spotify</span> — we use the Spotify API to look up music metadata.</li>
            <li><span className="text-zinc-200">Vercel</span> — web hosting and edge network.</li>
            <li><span className="text-zinc-200">Expo / EAS</span> — mobile app build and push notification infrastructure.</li>
          </ul>
        </Section>

        <Section title="Data retention">
          <p>
            We keep your data as long as your account is active. If you delete your account, we
            delete your profile, listening history, ratings, and reviews from our database within
            30 days. Some data may remain in encrypted backups for up to 90 days before being
            purged.
          </p>
        </Section>

        <Section title="Your rights">
          <p>You can:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><span className="text-zinc-200">Access your data</span> — your listening history, ratings, and profile are visible in the app.</li>
            <li><span className="text-zinc-200">Edit your profile</span> — change your username, bio, and photo at any time.</li>
            <li><span className="text-zinc-200">Make your logs private</span> — toggle listening history visibility in Settings.</li>
            <li><span className="text-zinc-200">Disconnect Last.fm or Spotify</span> — in Settings.</li>
            <li><span className="text-zinc-200">Delete your account</span> — in Settings → Delete account. This is permanent and removes all your data.</li>
            <li><span className="text-zinc-200">Request a data export</span> — email us at the address below.</li>
          </ul>
        </Section>

        <Section title="Age requirement">
          <p>
            By creating an account, you confirm you are at least 13 years old. If you become aware
            that someone under 13 has created an account, please contact us and we will remove it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy as the app evolves. If we make material changes we'll update
            the effective date at the top of this page. Continued use of Tracklist after changes
            are posted constitutes acceptance.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data? Email us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-gold-400 underline-offset-4 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

      </div>

      <div className="mt-16 border-t border-zinc-800 pt-6 text-xs text-zinc-600">
        Tracklist · {EFFECTIVE_DATE}
      </div>
    </div>
  );
}
