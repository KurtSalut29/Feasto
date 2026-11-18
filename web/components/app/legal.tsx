import type { ReactNode } from "react";

/** The version people agree to when they sign up (the API's TERMS_VERSION); change both with the text */
export const TERMS_UPDATED = "November 19, 2026";
const CONTACT = "admin@feasto.com";

/**
 * Feasto's Terms of Service and Privacy Policy. Shown on the public /terms and /privacy pages
 * (h2 sections) and in a pop-up from the sign-up form (h3 sections), so agreeing never loses
 * what was typed.
 */
export function TermsOfService({ inPopup = false }: { inPopup?: boolean }) {
  const Section = inPopup ? PopupSection : PageSection;
  return (
    <>
      <Section title="1. About these terms">
        <p>
          Feasto is an online platform in Naval, Biliran, where residents order food and book tables from local food businesses, and riders deliver the orders. These terms are the
          agreement between you and the Feasto team. By creating an account you agree to them and to our <Strong>Privacy Policy</Strong>. If you don&apos;t agree, please don&apos;t use Feasto.
        </p>
      </Section>

      <Section title="2. Your account">
        <List
          items={[
            "Give your real name, mobile number and email, and keep them up to date. One account per person.",
            "Keep your password to yourself. You're responsible for what's done with your account; change your password right away if you think someone else knows it.",
            "You must be 18 or older to sign up as a rider or a food business. Residents under 18 need a parent's or guardian's permission.",
            "Feasto may refuse, suspend or close an account that breaks these terms, gives false details, or puts others at risk. We'll tell you why.",
          ]}
        />
      </Section>

      <Section title="3. Food businesses">
        <List
          items={[
            "A store opens to residents only after Feasto checks its details and its valid business permit.",
            "You're responsible for your food: its safety, quality, allergens and that it matches your menu. Keep your menu, prices, stock and opening hours correct.",
            "Accept or decline orders promptly. Orders nobody acts on are cancelled automatically after the time set by Feasto, and the customer is told.",
            "Feasto takes a commission on the food of each order, plus any fees shown in your store settings and reports. New stores may get a commission-free period.",
            "Feasto reminds you 30 days and 7 days before your business permit expires. If it's still expired 7 days after its date, your store stops taking orders and bookings by itself until a renewed permit is approved. Orders already placed can still be finished.",
          ]}
        />
      </Section>

      <Section title="4. Riders">
        <List
          items={[
            "You can take jobs only after your account and driver's license are approved, by Feasto or by the store you ride for.",
            "Follow traffic laws, wear a helmet and handle the food with care. Take the proof-of-delivery photo when you hand an order over.",
            "On cash orders, collect the exact amount shown and hand it in as Feasto or the store asks.",
            "Your pay is the delivery fee minus Feasto's share, which is shown before you accept. Tips are all yours.",
            "Feasto reminds you before your license expires. With an expired license you're taken offline and can't take new jobs until a renewed license is approved; a delivery already under way can be finished.",
          ]}
        />
      </Section>

      <Section title="5. Orders, payments and cancellations">
        <List
          items={[
            "Prices are set by each store. You see the food, the delivery fee and the total before you place an order.",
            "Pay in cash on delivery or pickup, or online. Online payments are processed by Xendit; Feasto never sees or keeps your card or e-wallet details.",
            "An online payment must be finished within the time shown, or the order is cancelled.",
            "You can cancel an order until the store accepts it. After that, contact the store through the order's chat if something is wrong.",
            "If an order paid online is cancelled, declined by the store, or cancelled automatically because no store or rider took it, its part of the payment is refunded to where it came from.",
          ]}
        />
      </Section>

      <Section title="6. Choosing a rider, and Pabili">
        <List
          items={[
            "You may ask for a particular rider. They get your delivery first for a short time; if they can't take it, it goes to the nearest free rider.",
            "Pabili lets you ask a rider to buy things at a shop that isn't on Feasto. The rider pays at the shop, shows you the receipt, and you pay them back in cash with the delivery fee.",
            "You pay what the receipt says, never more than the budget you set. The budget has a limit shown in the app, so a rider never lends a large amount.",
            "The delivery fee is worked out from where the rider buys (their phone's location at the shop) to your address, and is never more than the highest fee shown before you send it.",
            "A Pabili can be cancelled only until a rider takes it. One nobody takes in the time shown is cancelled, and you pay nothing.",
            "Don't ask for anything illegal, dangerous or age-restricted. The rider may refuse an item, and Feasto isn't responsible for what a shop outside Feasto sells.",
          ]}
        />
      </Section>

      <Section title="7. Table reservations">
        <p>
          Bookings are requests until the store confirms them. Arrive on time; a store may mark a booking as a no-show if you don&apos;t come. Cancel in the app if your plans change.
        </p>
      </Section>

      <Section title="8. Using Feasto fairly">
        <p>Don&apos;t:</p>
        <List
          items={[
            "place fake orders or bookings, or orders you don't mean to pay for;",
            "harass, threaten or insult anyone in chats, ratings or reviews;",
            "post ratings or reviews that aren't honest, or for orders you weren't part of;",
            "use someone else's account, documents or identity;",
            "try to break, overload or get around Feasto's security, or copy its data with automated tools.",
          ]}
        />
      </Section>

      <Section title="9. What Feasto is responsible for">
        <p>
          Feasto connects residents, food businesses and riders. The store is responsible for the food it sells, and the rider for the delivery they accept. We work to keep Feasto
          running and correct, but it may sometimes be unavailable or make mistakes. As far as the law allows, Feasto&apos;s responsibility for any order is limited to the amount paid
          for that order. Nothing in these terms takes away your rights under Philippine consumer law.
        </p>
      </Section>

      <Section title="10. Changes and contact">
        <p>
          We may update these terms. When we make an important change we&apos;ll tell you in the app before it applies. These terms follow the laws of the Philippines. Questions? Email{" "}
          <Mail />.
        </p>
      </Section>
    </>
  );
}

export function PrivacyPolicy({ inPopup = false }: { inPopup?: boolean }) {
  const Section = inPopup ? PopupSection : PageSection;
  return (
    <>
      <Section title="1. Our promise">
        <p>
          Feasto collects only what it needs to get your food to you, keep everyone safe and pay the people who did the work. We follow the <Strong>Data Privacy Act of 2012</Strong>{" "}
          (Republic Act No. 10173) of the Philippines.
        </p>
      </Section>

      <Section title="2. What we collect">
        <List
          items={[
            "Everyone: your name, email, mobile number and password (stored only as a scrambled hash, never as typed), and your display settings.",
            "Residents: delivery addresses and their map pins, orders, bookings, saved stores, ratings and order chats.",
            "Food businesses: the store's name, address and map pin, owner and business contact details, the business permit's number, expiry date and photo, the menu, and sales.",
            "Riders: birth date, home address, emergency contact, motorcycle and plate number, the driver's license's number, expiry date and photo, and earnings.",
            "Riders' location: only while you're online or on a delivery, so jobs reach the nearest riders and customers can follow their order. Going offline removes your last position.",
            "Delivery photos, payment references (not card numbers), notification settings, and basic technical details like your IP address, used to stop abuse.",
          ]}
        />
      </Section>

      <Section title="3. Who sees what">
        <List
          items={[
            "The store sees your name, mobile number, address and items for orders placed with it.",
            "The rider sees your name, mobile number and delivery address for the delivery they accepted, and only until it's done.",
            "You see your rider's name, mobile number, motorcycle and live location while they bring your order.",
            "The Feasto admin sees what's needed to approve accounts, check documents, help with problems and run reports.",
            "Service providers that help us run Feasto: Xendit (online payments), Mapbox (maps and directions) and your browser's notification service. We don't sell your information to anyone.",
          ]}
        />
      </Section>

      <Section title="4. How long we keep it">
        <p>
          Your account details stay while your account is open. Orders and payments are kept for records and reports. When a renewed permit or license is approved, the old photo is
          deleted. A cart is cleared after 7 days without changes.
        </p>
      </Section>

      <Section title="5. How we protect it">
        <p>
          Feasto runs over secure (HTTPS) connections, each role can only open its own part of the app, permits and licenses are seen only by their owner and the people who review them, and changing your
          password signs out your other devices.
        </p>
      </Section>

      <Section title="6. Your rights">
        <p>
          Under the Data Privacy Act you can ask to see the information we have about you, correct it, have it deleted or blocked, or object to how it&apos;s used. You can change most of
          it yourself under Account. For anything else, email <Mail />. If you think we mishandled your information, you can complain to the National Privacy Commission.
        </p>
      </Section>
    </>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>;
}

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} className="font-semibold text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500">
      {CONTACT}
    </a>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 marker:text-brand-500">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function PageSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      <div className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

/** Under the pop-up's own title (an h2), so its sections are h3s */
function PopupSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
