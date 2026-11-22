import { prisma } from "./db.js";
import { quoteDelivery } from "./deliveryFee.js";
import { HttpError } from "./http.js";
import { notify } from "./liveUpdates.js";
import { pointsFor, tierOf } from "./loyalty.js";
import { broadcastOrder, orderCode } from "./orders.js";
import { invalidateStore } from "./redisCache.js";
import { getSettings } from "./settings.js";

/**
 * Changing an order before the store accepts it: how many of each dish (0 takes it off), or where
 * it goes. Only cash orders without discounts, so nothing paid or promised has to be worked out
 * again; once the store accepts (or a rider is on it), it's too late and the resident cancels or
 * calls the store instead.
 */

const c = (n: number) => Math.round(n * 100) / 100;

export async function editOrder(userId: string, orderId: string, input: { items?: { id: string; quantity: number }[]; addressId?: string }) {
  if (!input.items?.length && !input.addressId) throw new HttpError(400, "Change a dish or the address first.");
  const order = await prisma.order.findFirst({
    where: { id: orderId, checkout: { residentId: userId } },
    select: {
      status: true,
      riderId: true,
      fulfillment: true,
      subtotal: true,
      deliveryFee: true,
      extraFee: true,
      commissionRate: true,
      storeDiscount: true,
      feastoDiscount: true,
      pointsUsed: true,
      vendorId: true,
      vendor: { select: { name: true, ownerId: true, latitude: true, longitude: true, deliveryRadiusKm: true, minOrderAmount: true } },
      items: { select: { id: true, name: true, quantity: true, unitPrice: true, menuItemId: true, removedAt: true, menuItem: { select: { stock: true } } } },
      checkout: { select: { id: true, paymentMethod: true, total: true, _count: { select: { orders: true } } } },
      _count: { select: { promoUses: true } },
    },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order.");
  if (!["PLACED", "SCHEDULED"].includes(order.status) || order.riderId) throw new HttpError(409, "The store already accepted this order, so it can't be changed. Call the store, or cancel it if that's still allowed.");
  if (order.checkout.paymentMethod !== "COD") throw new HttpError(409, "Orders paid online can't be changed (the amount is already paid). Cancel it for a refund and order again.");
  if (Number(order.storeDiscount) > 0 || Number(order.feastoDiscount) > 0 || order.pointsUsed > 0 || order._count.promoUses > 0) {
    throw new HttpError(409, "This order has a discount, so it can't be changed (the discount was worked out for these dishes). Cancel it and order again.");
  }
  const settings = await getSettings();

  // The dishes: new quantities, checked against the stock that's left
  const live = order.items.filter((i) => !i.removedAt);
  const wanted = new Map((input.items ?? []).map((i) => [i.id, i.quantity]));
  for (const id of wanted.keys()) if (!live.some((i) => i.id === id)) throw new HttpError(400, "One of those dishes isn't on this order.");
  const next = live.map((i) => ({ ...i, newQuantity: wanted.get(i.id) ?? i.quantity }));
  if (!next.some((i) => i.newQuantity > 0)) throw new HttpError(400, "An order needs at least one dish. To drop all of them, cancel the order.");
  const subtotal = c(next.reduce((n, i) => n + Number(i.unitPrice) * i.newQuantity, 0));
  const delivery = order.fulfillment === "DELIVERY";
  const minimum = Number(order.vendor.minOrderAmount);
  if (delivery && minimum > 0 && subtotal < minimum) throw new HttpError(400, `${order.vendor.name}'s minimum for delivery is ₱${minimum}. Keep ₱${c(minimum - subtotal)} more food on the order.`);

  // The address: a new fee for the new distance (the busy or rain add-on stays as it was)
  let deliveryFee = Number(order.deliveryFee);
  let addressData: { deliveryAddress: string; deliveryLat: number | null; deliveryLng: number | null } | null = null;
  let deliveryKm: number | null | undefined;
  if (input.addressId) {
    if (!delivery) throw new HttpError(400, "This is a pickup order, so it has no address.");
    if (order.checkout._count.orders > 1) throw new HttpError(409, "This order was placed with others from more stores, so the address can't be changed for only one of them.");
    const address = await prisma.address.findFirst({ where: { id: input.addressId, userId } });
    if (!address) throw new HttpError(400, "Choose one of your saved addresses.");
    const quote = await quoteDelivery(order.vendor, address, settings);
    if (quote.km !== null && quote.km > Number(order.vendor.deliveryRadiusKm)) {
      throw new HttpError(400, `${order.vendor.name} delivers up to ${Number(order.vendor.deliveryRadiusKm)} km, and that address is ${quote.km} km away.`);
    }
    deliveryFee = c(quote.fee + Number(order.extraFee));
    deliveryKm = quote.km;
    addressData = { deliveryAddress: [address.details, address.landmark].filter(Boolean).join(" · "), deliveryLat: address.latitude, deliveryLng: address.longitude };
  }

  const oldTotal = c(Number(order.subtotal) + Number(order.deliveryFee));
  const newTotal = c(subtotal + deliveryFee);
  const checkoutTotal = c(Number(order.checkout.total) - oldTotal + newTotal);
  if (checkoutTotal > settings.codMaxAmount) throw new HttpError(400, `Cash on delivery is for orders up to ₱${settings.codMaxAmount.toLocaleString("en-PH")}. Keep it under that, or cancel and pay online.`);
  const tier = await tierOf(prisma, userId);

  await prisma.$transaction(async (tx) => {
    // Claims the order first: if the store accepts it at the same moment, only one of them wins
    const { count } = await tx.order.updateMany({ where: { id: orderId, status: { in: ["PLACED", "SCHEDULED"] }, riderId: null }, data: { editedAt: new Date() } });
    if (!count) throw new HttpError(409, "The store just accepted this order, so it can't be changed now.");
    for (const item of next) {
      const diff = item.newQuantity - item.quantity;
      if (!diff) continue;
      if (item.menuItem.stock !== null) {
        if (diff > 0) {
          const { count: got } = await tx.menuItem.updateMany({ where: { id: item.menuItemId, stock: { gte: diff }, deletedAt: null }, data: { stock: { decrement: diff } } });
          if (!got) throw new HttpError(409, `There aren't ${item.newQuantity} of ${item.name} left. Choose fewer.`);
        } else {
          await tx.menuItem.update({ where: { id: item.menuItemId }, data: { stock: { increment: -diff } } });
        }
      }
      if (item.newQuantity === 0) await tx.orderItem.delete({ where: { id: item.id } });
      else await tx.orderItem.update({ where: { id: item.id }, data: { quantity: item.newQuantity } });
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal,
        deliveryFee,
        ...(deliveryKm !== undefined && { deliveryKm }),
        commission: c((subtotal * Number(order.commissionRate)) / 100),
        pointsEarned: pointsFor(subtotal, tier.multiplier, settings),
      },
    });
    await tx.checkout.update({ where: { id: order.checkout.id }, data: { total: checkoutTotal, ...addressData } });
  });

  const changes = next.filter((i) => i.newQuantity !== i.quantity).map((i) => (i.newQuantity ? `${i.name} ${i.quantity}→${i.newQuantity}` : `${i.name} taken off`));
  if (addressData) changes.push("new address");
  await notify(order.vendor.ownerId, { title: `${orderCode(orderId)} was changed`, body: `${changes.join(", ")}. New total ₱${newTotal.toFixed(2)}.`, link: `/vendor/orders/${orderId}` });
  await invalidateStore(order.vendorId);
  await broadcastOrder(orderId);
  return { ok: true, subtotal, deliveryFee, total: newTotal };
}
