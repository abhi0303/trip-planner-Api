/** Just enough of a place to derive a trip's display fields from. */
export interface DestinationLike {
  id: string;
  name: string;
  state: string | null;
}

export interface DerivedDestinationFields {
  destination: string;
  state: string | null;
  destinationId: string | null;
}

/**
 * A trip keeps `destination`, `state` and `destinationId` as real columns so
 * existing cards, filters and saved links keep working now that a trip can have
 * several destinations. They are computed from the destination set unless the
 * author supplied a value of their own.
 *
 * A trip spanning two states gets no state rather than an arbitrary one:
 * GET /trips?state=Goa should not return a trip that was half in Kerala.
 */
export function deriveDestinationFields(
  destinations: DestinationLike[],
  explicit: { destination?: string; state?: string } = {},
): DerivedDestinationFields {
  const states = new Set(destinations.map((d) => d.state).filter((s): s is string => !!s));

  return {
    destination: explicit.destination ?? destinations.map((d) => d.name).join(', '),
    state: explicit.state ?? (states.size === 1 ? [...states][0] : null),
    destinationId: destinations[0]?.id ?? null,
  };
}
