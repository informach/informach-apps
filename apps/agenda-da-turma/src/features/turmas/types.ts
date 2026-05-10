import type { TurmaGrade } from "./limits";

export type Turma = {
  id: string;
  code: string;
  schoolInepCode: string;
  grade: TurmaGrade;
  year: number;
  classLetter: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TurmaWithSchool = Turma & {
  schoolName: string;
  cityName: string;
  stateUf: string;
};

export type TurmaForUser = TurmaWithSchool & {
  // Membros (perfis do user) que estão na turma + se o perfil tem essa turma como ativa.
  members: Array<{
    profileId: string;
    profileName: string;
    isActive: boolean;
  }>;
};

export type StateOption = { uf: string; name: string };
export type CityOption = { ibgeCode: string; name: string };
export type SchoolOption = { inepCode: string; name: string };
