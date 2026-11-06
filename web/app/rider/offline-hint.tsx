import Link from "next/link";

/** What an offline rider should do. With an expired license the Online switch isn't there to turn on. */
export function OfflineHint({ licenseExpired }: { licenseExpired?: boolean }) {
  if (!licenseExpired) return <>Turn on the Online switch above to see delivery jobs.</>;
  return (
    <>
      Your driver&apos;s license has expired.{" "}
      <Link href="/rider/license" className="font-semibold text-brand-700 hover:underline">
        Send the renewed one
      </Link>{" "}
      so you can go online.
    </>
  );
}
