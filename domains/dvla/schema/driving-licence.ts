import { z } from "zod";

/**
 * The DrivingLicence contract. Source of truth for the typed consumer and for
 * inline drift detection in the execution route.
 */
export const DrivingLicence = z.object({
  licenceNumber: z.string(),
  categories: z.array(z.string()),
  validFrom: z.string(),
  validTo: z.string(),
  status: z.string(),
});

export type DrivingLicence = z.infer<typeof DrivingLicence>;
