import { deriveDestinationFields } from './destination.util';

const northGoa = { id: 'ng', name: 'North Goa', state: 'Goa' };
const southGoa = { id: 'sg', name: 'South Goa', state: 'Goa' };
const manali = { id: 'mn', name: 'Manali', state: 'Himachal Pradesh' };

describe('deriveDestinationFields', () => {
  it('joins the names in the order given', () => {
    expect(deriveDestinationFields([northGoa, southGoa]).destination).toBe('North Goa, South Goa');
    expect(deriveDestinationFields([southGoa, northGoa]).destination).toBe('South Goa, North Goa');
  });

  it('keeps the shared state when every destination agrees', () => {
    expect(deriveDestinationFields([northGoa, southGoa]).state).toBe('Goa');
  });

  it('drops the state when destinations span more than one', () => {
    expect(deriveDestinationFields([southGoa, manali]).state).toBeNull();
  });

  it('mirrors the first destination into the legacy id', () => {
    expect(deriveDestinationFields([southGoa, manali]).destinationId).toBe('sg');
  });

  it('lets an explicit label and state win', () => {
    const derived = deriveDestinationFields([southGoa, manali], {
      destination: 'Golden Triangle',
      state: 'Goa',
    });
    expect(derived.destination).toBe('Golden Triangle');
    expect(derived.state).toBe('Goa');
  });

  it('ignores destinations with no state of their own', () => {
    const stateless = { id: 'x', name: 'Somewhere', state: null };
    expect(deriveDestinationFields([southGoa, stateless]).state).toBe('Goa');
  });

  it('survives an empty set, for a label-only trip', () => {
    expect(deriveDestinationFields([])).toEqual({
      destination: '',
      state: null,
      destinationId: null,
    });
  });
});
