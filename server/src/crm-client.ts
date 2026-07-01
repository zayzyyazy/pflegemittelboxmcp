export interface CrmClientConfig {
  baseUrl: string;
  apiKey?: string;
}

export type CrmFetchFn = typeof fetch;

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const segment = path.replace(/^\//, '');
  return `${base}/${segment}`;
}

export async function crmPost(
  path: string,
  body: Record<string, string>,
  config: CrmClientConfig,
  fetchFn: CrmFetchFn = fetch
): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetchFn(joinUrl(config.baseUrl, path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  } else {
    parsed = null;
  }

  if (!response.ok) {
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return { error: typeof parsed === 'string' ? parsed : `HTTP ${response.status}` };
  }

  return parsed;
}

export interface PlzGebLookupParams {
  plz: string;
  house_number: string;
  birthday: string;
}

export async function getCustomerByPlzGeb(
  params: PlzGebLookupParams,
  config: CrmClientConfig,
  fetchFn: CrmFetchFn = fetch
): Promise<unknown> {
  return crmPost(
    'get_customer_by_plz_geb',
    {
      plz: params.plz,
      house_number: params.house_number,
      birthday: params.birthday,
    },
    config,
    fetchFn
  );
}

export async function getCustomerByInsuranceNumber(
  insurance_number: string,
  config: CrmClientConfig,
  fetchFn: CrmFetchFn = fetch
): Promise<unknown> {
  return crmPost('get_customer_by_insurance_number', { insurance_number }, config, fetchFn);
}
