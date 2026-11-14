import { Bell, Contrast, Hand, Keyboard, MonitorSmartphone, Pause, ScanEye, Type } from "lucide-react";
import type { ReactNode } from "react";

/** When the app was last checked against WCAG 2.2 AA */
const CHECKED_ON = "November 2026";

const FEATURES: { Icon: typeof Type; title: string; text: string }[] = [
  { Icon: Type, title: "Bigger text", text: "Normal, Large or Extra large. Everything in the app grows with it, and the screen rearranges instead of cutting words off." },
  { Icon: Contrast, title: "High contrast", text: "Darker text and lines, a deeper orange and a thicker outline around what you're on, for low vision or bright sunlight." },
  { Icon: Pause, title: "Reduce motion", text: "Turns off every animation. Feasto also follows the reduce-motion setting of your phone or computer." },
  { Icon: Hand, title: "Bigger buttons", text: "Everything you tap becomes at least 44 pixels, for shaky hands, gloves or a bumpy ride." },
  { Icon: ScanEye, title: "Screen readers", text: "Every button, picture and form field has a name a screen reader reads out, like TalkBack on Android or VoiceOver on iPhone. New orders, order updates and messages are read out as they arrive." },
  { Icon: Keyboard, title: "Keyboard", text: "Everything works with the Tab and Enter keys, with a clear outline on what's chosen. \"Skip to main content\" is the first thing the Tab key reaches." },
  { Icon: Bell, title: "Not by sound alone", text: "A new order for a store plays a chime, buzzes the phone and shows a message, so it's noticed even with the sound off." },
  { Icon: MonitorSmartphone, title: "Any screen", text: "Works from a small phone (320 pixels wide) to a big monitor, upright or sideways, and zoomed in up to 200%." },
];

/**
 * Feasto's accessibility statement: the standard it follows, what helps, how it was tested and
 * what's still not perfect. Shown on the public /accessibility page (h2 sections) and in a pop-up
 * on Display & accessibility (h3 sections, under the pop-up's own title).
 */
export function AccessibilityStatement({ inPopup = false }: { inPopup?: boolean }) {
  const strong = "text-ink";
  const Section = inPopup ? PopupSection : PageSection;

  return (
    <>
      <Section title="The standard we follow">
        <p>
          Feasto follows the <strong className={strong}>Web Content Accessibility Guidelines (WCAG) 2.2, level AA</strong>, the international standard for accessible websites and apps. In short, it
          means Feasto can be seen, used, understood and read by assistive technology.
        </p>
      </Section>

      <Section title={inPopup ? "What helps" : "Make Feasto easier for you"}>
        {inPopup ? (
          <p>The settings on this page, plus what Feasto does for everyone:</p>
        ) : (
          <p>
            After you log in, open <strong className={strong}>Account → Display &amp; accessibility</strong> (on a computer, <strong className={strong}>Display &amp; accessibility</strong> in the
            menu). What you choose is saved to your account, so it follows you to any phone.
          </p>
        )}
        <ul className={`grid gap-3 sm:grid-cols-2 ${inPopup ? "mt-3" : "mt-5"}`}>
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title} className={`flex gap-3 rounded-2xl border border-line bg-white ${inPopup ? "p-3" : "p-4"}`}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{title}</span>
                <span className="mt-0.5 block text-sm text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How it was checked">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Every main page of all four roles was scanned with <strong className={strong}>axe-core</strong>, the accessibility checker used by browser developer tools, against WCAG 2.2 AA, and every
            problem it found was fixed.
          </li>
          <li>The whole order, from placing it to the store accepting it and the rider delivering it, was done with the keyboard only.</li>
          <li>Pages were checked on a 320-pixel-wide screen, with text at 200%, with reduce motion on, and in high contrast.</li>
          <li>Colours were measured: text is at least 4.5 to 1 against its background, and large text and icons at least 3 to 1.</li>
        </ul>
        <p className="mt-3">Last checked: {CHECKED_ON}.</p>
      </Section>

      <Section title="What isn't perfect yet">
        <ul className="list-disc space-y-2 pl-5">
          <li>The maps are pictures of the area. Everything on them is also written out next to the map: the store&apos;s address, how far it is, and the rider&apos;s progress.</li>
          <li>Card and e-wallet payments happen on Xendit&apos;s secure page, which Feasto doesn&apos;t control.</li>
          <li>Feasto is in English only for now.</li>
        </ul>
      </Section>

      <Section title="Tell us about a problem">
        <p>
          If something in Feasto is hard for you to use, email{" "}
          <a href="mailto:admin@feasto.com" className="font-semibold text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500">
            admin@feasto.com
          </a>{" "}
          with the page and what happened. We read every message.
        </p>
      </Section>
    </>
  );
}

function PageSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      <div className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

/** Under the pop-up's own title (an h2), so its sections are h3s */
function PopupSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
