import { redirect } from "next/navigation";

/** The password is now changed in a pop-up from Settings (or the key in the sidebar). Old links land there. */
export default function AdminPasswordPage() {
  redirect("/admin/settings");
}
