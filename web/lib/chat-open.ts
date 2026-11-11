/** The order chats open on screen right now, so a new message there doesn't also pop up as a toast. */
const open = new Map<string, number>();

export function markChatOpen(orderId: string) {
  open.set(orderId, (open.get(orderId) ?? 0) + 1);
  return () => {
    const left = (open.get(orderId) ?? 1) - 1;
    if (left > 0) open.set(orderId, left);
    else open.delete(orderId);
  };
}

export const isChatOpen = (orderId: string) => open.has(orderId);
