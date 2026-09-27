/**
 * Where a seeded photo lives in Storage — the same shape the API accepts from a
 * merchant (`assertMediaPath`): `<bucket>/<vendorId>/<file>`, one folder per
 * shop. Seeded photos follow the merchant convention so a merchant who later
 * replaces one goes through exactly the path their own upload would take.
 */
export const productImagePath = (vendorId: string, file: string) => `product-media/${vendorId}/${file}.jpg`;
export const vendorImagePath = (vendorId: string, file: string) => `vendor-media/${vendorId}/${file}.jpg`;
