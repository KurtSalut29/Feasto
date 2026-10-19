import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { SIDEBAR_INIT_SCRIPT } from "@/lib/sidebar";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Feasto", template: "%s · Feasto" },
  description: "Order food and book tables from every vendor in your community.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The sidebar script below may add data-sidebar to <html> before React loads
    <html lang="en" className={`${poppins.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
