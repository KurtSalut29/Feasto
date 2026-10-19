import { CircleAlert, Clock } from "lucide-react";
import type { ReactNode } from "react";

const tones = {
  error: { box: "border-red-200 bg-red-50 text-red-800", Icon: CircleAlert },
  pending: { box: "border-amber-200 bg-amber-50 text-amber-900", Icon: Clock },
};

export function Alert({ tone, title, children }: { tone: keyof typeof tones; title?: string; children: ReactNode }) {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${box}`}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
    </div>
  );
}
