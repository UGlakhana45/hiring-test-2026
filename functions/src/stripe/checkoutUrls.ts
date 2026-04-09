/** Stripe Checkout requires https:// URLs — custom schemes like clinicapp:// are rejected. */
export function stripeCheckoutReturnUrls(): { success_url: string; cancel_url: string } {
  return {
    success_url:
      process.env.STRIPE_CHECKOUT_SUCCESS_URL?.trim() ||
      'https://example.com/hiring-test-checkout-success',
    cancel_url:
      process.env.STRIPE_CHECKOUT_CANCEL_URL?.trim() ||
      'https://example.com/hiring-test-checkout-canceled',
  };
}
