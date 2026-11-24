/** The timeline input fields. */
export interface Timeline {
    startYear: number; // calendar year of year 1
    years: number; // whole number, 1 to 150
}

/** One year of the projection, as both a projection year and a calendar year. */
export interface YearRef {
    year: number; // 1-based projection year
    calendarYear: number; // startYear + year - 1
}
