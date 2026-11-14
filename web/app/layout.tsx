import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { CelebrationHost } from "@/components/app/celebrate";
import { ServiceWorkerRegistration } from "@/components/app/install-app";
import { Toaster } from "@/components/ui/toast";
import { ENTRANCE_SCRIPT } from "@/lib/page-entrance";
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
  // Installed on an iPhone home screen: open full screen under the name "Feasto"
  appleWebApp: { capable: true, title: "Feasto", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  // Lets the page reach the screen edges on notched phones; safe-area padding keeps content clear
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The sidebar script below may add data-sidebar to <html> before React loads
    <html lang="en" className={`${poppins.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
        {/* Names the log-in and log-out page changes for their animations (lib/page-entrance.ts) */}
        <script dangerouslySetInnerHTML={{ __html: ENTRANCE_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        {children}
        <Toaster />
        <CelebrationHost />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
