import { Timestamp } from '@react-native-firebase/firestore';
import type { AddonType } from './subscription';

export type Discount = {
  id: string;
  code: string;
  percentOff: number; // 0-100
  appliesToBase: boolean; // applies to base plan price
  appliesToAddons: AddonType[] | 'all'; // which add-on types this discount applies to
  validUntil: Timestamp;
  usageLimit: number;
  usedCount: number;
};

// Whether a discount is currently valid for new applications
export function isDiscountValid(discount: Discount): boolean {
  const now = new Date();
  const expiry = discount.validUntil.toDate();
  return expiry > now && discount.usedCount < discount.usageLimit;
}

// Existing subscribers keep their discount until their next renewal date, at which point Stripe
// will re-evaluate. This avoids unexpected mid-cycle price changes and matches how Stripe handles
// coupon removals natively.
export function calculateDiscountedPrice(
  _basePrice: number,
  _itemType: 'base' | AddonType,
  _discount: Discount,
): number {
  const now = new Date();
  if (_discount.validUntil.toDate() < now) {
    throw new Error('Discount expired');
  }

  let applies = false;
  if (_itemType === 'base') {
    applies = _discount.appliesToBase;
  } else {
    const scope = _discount.appliesToAddons;
    applies = scope === 'all' ? true : scope.includes(_itemType);
  }

  if (!applies) {
    return Math.round(_basePrice * 100) / 100;
  }

  const discounted = _basePrice * (1 - _discount.percentOff / 100);
  return Math.round(discounted * 100) / 100;
}
