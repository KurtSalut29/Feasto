import { Check } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Fulfillment, OrderStatus } from "@/lib/types";

type Step = { key: OrderStatus; label: string; at?: string | null };

const ORDER: OrderStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY", "PICKED_UP", "DELIVERED", "COMPLETED"];

/** The steps an order goes through, with the ones already done ticked. */
export function OrderProgress({
  status,
  fulfillment,
  times,
}: {
  status: OrderStatus;
  fulfillment: Fulfillment;
  times: { createdAt: string; acceptedAt: string | null; readyAt: string | null; pickedUpAt: string | null; finishedAt: string | null };
}) {
  const steps: Step[] =
    fulfillment === "DELIVERY"
      ? [
          { key: "PLACED", label: "Order placed", at: times.createdAt },
          { key: "ACCEPTED", label: "Accepted by the store", at: times.acceptedAt },
          { key: "PREPARING", label: "Being prepared" },
          { key: "READY", label: "Ready for the rider", at: times.readyAt },
          { key: "PICKED_UP", label: "On the way", at: times.pickedUpAt },
          { key: "DELIVERED", label: "Delivered", at: times.finishedAt },
        ]
      : [
          { key: "PLACED", label: "Order placed", at: times.createdAt },
          { key: "ACCEPTED", label: "Accepted by the store", at: times.acceptedAt },
          { key: "PREPARING", label: "Being prepared" },
          { key: "READY", label: "Ready for pickup", at: times.readyAt },
          { key: "COMPLETED", label: "Collected", at: times.finishedAt },
        ];
  const reached = ORDER.indexOf(status === "AWAITING_PAYMENT" ? "PLACED" : status);

  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const done = ORDER.indexOf(step.key) <= reached && status !== "AWAITING_PAYMENT";
        const current = ORDER.indexOf(step.key) === reached;
        const last = index === steps.length - 1;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  done ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white"
                } ${current && !last ? "ring-4 ring-brand-100" : ""}`}
              >
                {done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
              </span>
              {!last && <span className={`w-0.5 flex-1 ${done && !current ? "bg-brand-600" : "bg-gray-200"}`} />}
            </div>
            <div className={`pb-5 ${last ? "pb-0" : ""}`}>
              <p className={`text-[15px] ${done ? "font-semibold text-ink" : "text-muted"}`}>{step.label}</p>
              {done && step.at && <p className="text-xs text-gray-400">{formatDateTime(step.at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
