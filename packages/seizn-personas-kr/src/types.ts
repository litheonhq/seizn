export type KoreanPersonaSex = '남자' | '여자';

export type KoreanPersona = {
  uuid: string;
  professional_persona: string;
  sports_persona: string;
  arts_persona: string;
  travel_persona: string;
  culinary_persona: string;
  family_persona: string;
  persona: string;
  cultural_background: string;
  skills_and_expertise: string;
  skills_and_expertise_list: string[];
  hobbies_and_interests: string;
  hobbies_and_interests_list: string[];
  career_goals_and_ambitions: string;
  sex: KoreanPersonaSex;
  age: number;
  marital_status: string;
  military_status: string;
  family_type: string;
  housing_type: string;
  education_level: string;
  bachelors_field: string;
  occupation: string;
  district: string;
  province: string;
  country: string;
};

export type PersonaFilterCriteria = {
  province?: string;
  district?: string;
  /**
   * Backward-compatible alias for province or district. Prefer province/district
   * because Nemotron-Personas-Korea does not expose a top-level region field.
   */
  region?: string;
  occupation?: string;
  ageRange?: readonly [min: number, max: number];
  sex?: KoreanPersonaSex;
  educationLevel?: string;
  limit?: number;
};
