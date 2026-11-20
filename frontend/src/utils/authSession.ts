export interface CompanyInfo {
  id?: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  username: string;
  role: string;
  companyId?: string;
  company?: CompanyInfo;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readIdString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function extractCompanyInfo(
  rawCompany: unknown,
  fallbackRecord?: unknown
): CompanyInfo | undefined {
  if (isRecord(rawCompany)) {
    const id = readIdString(rawCompany.id);
    const name = readNonEmptyString(rawCompany.name);
    const slug = readNonEmptyString(rawCompany.slug);
    if (name || slug) {
      return {
        ...(id ? { id } : {}),
        name: name ?? slug!,
        slug: slug ?? name!,
      };
    }
  }

  if (isRecord(fallbackRecord)) {
    const id = readIdString(fallbackRecord.companyId);
    const name = readNonEmptyString(fallbackRecord.companyName);
    const slug = readNonEmptyString(fallbackRecord.companySlug);
    if (name || slug) {
      return {
        ...(id ? { id } : {}),
        name: name ?? slug!,
        slug: slug ?? name!,
      };
    }
  }

  return undefined;
}

export function normalizeUserRecord(rawUser: unknown, fallbackCompany?: unknown): User | null {
  if (!isRecord(rawUser)) return null;

  const id = readIdString(rawUser.id);
  const username = readNonEmptyString(rawUser.username);
  const role = readNonEmptyString(rawUser.role);
  if (!id || !username || !role) return null;

  const company = extractCompanyInfo(rawUser.company ?? fallbackCompany, rawUser);
  const companyId = readIdString(rawUser.companyId) ?? company?.id;

  return {
    id,
    username,
    role,
    ...(companyId ? { companyId } : {}),
    ...(company ? { company } : {}),
  };
}

export function mergeMeIntoUser(meData: unknown, prevUser: User | null): User | null {
  if (!isRecord(meData)) return prevUser;

  const rawUser = isRecord(meData.user) ? meData.user : meData;
  const company = extractCompanyInfo(rawUser.company ?? meData.company, rawUser);
  const companyId = readIdString(rawUser.companyId) ?? company?.id ?? prevUser?.companyId;

  const id = readIdString(rawUser.id) ?? prevUser?.id;
  const username = readNonEmptyString(rawUser.username) ?? prevUser?.username;
  const role = readNonEmptyString(rawUser.role) ?? prevUser?.role;

  if (!id || !username || !role) {
    return prevUser;
  }

  const nextCompany = company ?? prevUser?.company;

  return {
    id,
    username,
    role,
    ...(companyId ? { companyId } : {}),
    ...(nextCompany ? { company: nextCompany } : {}),
  };
}
