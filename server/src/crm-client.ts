import { appConfig } from './config.js';

export type CrmFetchFn = typeof fetch;

export interface MarieCrmClientConfig {
  baseUrl: string;
  token: string;
  vnrEndpoint: string;
  plzGebEndpoint: string;
  vnrParam: string;
  plzParam: string;
  hnrParam: string;
  bdayParam: string;
}

function joinUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const path = endpoint.replace(/^\//, '');
  return `${base}/${path}`;
}

export function resolveMarieCrmClientConfig(): MarieCrmClientConfig | null {
  const baseUrl = appConfig.LEAPING_FUNC_BASE ?? appConfig.PFLEGEMITTELBOX_API_BASE;
  const token =
    appConfig.LEAPING_FUNC_TOKEN ??
    appConfig.LEAPING_FUNC_API_KEY ??
    appConfig.PFLEGEMITTELBOX_API_KEY;
  if (!baseUrl || !token) return null;

  return {
    baseUrl,
    token,
    vnrEndpoint: appConfig.LEAPING_FUNC_VNR_ENDPOINT,
    plzGebEndpoint: appConfig.LEAPING_FUNC_PLZ_GEB_ENDPOINT,
    vnrParam: appConfig.LEAPING_FUNC_VNR_PARAM,
    plzParam: appConfig.LEAPING_FUNC_PLZ_PARAM,
    hnrParam: appConfig.LEAPING_FUNC_HNR_PARAM,
    bdayParam: appConfig.LEAPING_FUNC_BDAY_PARAM,
  };
}

export function buildMarieCrmGetUrl(
  endpoint: string,
  query: Record<string, string>,
  config: MarieCrmClientConfig
): string {
  const url = new URL(joinUrl(config.baseUrl, endpoint));
  url.searchParams.set('token', config.token);
  for (const [key, value] of Object.entries(query)) {
    if (value.trim()) {
      url.searchParams.set(key, value.trim());
    }
  }
  return url.toString();
}

async function parseCrmResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function marieCrmGet(
  endpoint: string,
  query: Record<string, string>,
  config: MarieCrmClientConfig,
  fetchFn: CrmFetchFn = fetch
): Promise<unknown> {
  const url = buildMarieCrmGetUrl(endpoint, query, config);
  const response = await fetchFn(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const parsed = await parseCrmResponse(response);
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
  config: MarieCrmClientConfig,
  fetchFn: CrmFetchFn = fetch
): Promise<unknown> {
  return marieCrmGet(
    config.plzGebEndpoint,
    {
      [config.plzParam]: params.plz,
      [config.hnrParam]: params.house_number,
      [config.bdayParam]: params.birthday,
    },
    config,
    fetchFn
  );
}

export async function getCustomerByInsuranceNumber(
  insurance_number: string,
  config: MarieCrmClientConfig,
  fetchFn: CrmFetchFn = fetch
): Promise<unknown> {
  return marieCrmGet(
    config.vnrEndpoint,
    { [config.vnrParam]: insurance_number },
    config,
    fetchFn
  );
}
