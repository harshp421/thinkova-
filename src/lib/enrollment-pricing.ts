export const FIRST_INSTALLMENT = 3000;
const INSTALLMENT_SURCHARGE = 500;

export function enrollmentPricing(full: number) {
  return {
    full,
    first: FIRST_INSTALLMENT,
    second: full + INSTALLMENT_SURCHARGE - FIRST_INSTALLMENT,
    total: full + INSTALLMENT_SURCHARGE,
  };
}

export function formatEnrollmentAmount(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}
