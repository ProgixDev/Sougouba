import { z } from 'zod';

import { citySchema, postalCodeSchema } from '../address-validation.js';

export const coordinatesRequestSchema = z.object({
  postalCode: postalCodeSchema,
  city: citySchema,
});

export type CoordinatesRequest = z.infer<typeof coordinatesRequestSchema>;
