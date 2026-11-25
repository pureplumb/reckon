export interface Person {
    id: string; // unique identifier for person, e.g. dave
    birthYear: number; // calendar year
}

export interface Household {
    people: Person[];
}

/// What's included in ScheduleYear
export interface HouseholdSlice {
    ages: Record<string, number>; // each person's age this year, keyed by person id
}
