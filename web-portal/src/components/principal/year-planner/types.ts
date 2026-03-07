/** Term form data with Date for start/end (used when calling AI suggest from web) */
export interface TermFormData {
  name: string;
  academic_year: number;
  term_number: number;
  start_date: Date;
  end_date: Date;
  description: string;
  is_active: boolean;
  is_published: boolean;
}

/** Web form state (start_date/end_date as YYYY-MM-DD strings) */
export interface WebTermFormData {
  name: string;
  academic_year: number;
  term_number: number;
  start_date: string;
  end_date: string;
  description: string;
  is_active: boolean;
  is_published: boolean;
}
