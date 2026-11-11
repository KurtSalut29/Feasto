import { redirect } from "next/navigation";

/** The password is now changed in a pop-up from Store settings (or the key in the sidebar). Old links land there. */
export default function VendorPasswordPage() {
  redirect("/vendor/store");
}
