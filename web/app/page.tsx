import { redirect } from "next/navigation";

// proxy.ts normally redirects "/" first (to /login, or to the user's dashboard).
export default function Home() {
  redirect("/login");
}
