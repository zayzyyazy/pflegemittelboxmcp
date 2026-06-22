export interface DeliveryStatusReasonerInput {
  status?: string;
  box_genehmigt?: string;
  letzte_box?: string | string[];
  gen_pg54_ab?: string;
  gen_pg51_ab?: string;
  requested_month?: string;
  now?: string;
  vip?: boolean;
}

export interface DeliveryStatusReasonerResult {
  ok: boolean;
  delivery_status:
    | 'ACTIVE_AND_SHIPPED'
    | 'ACTIVE_NOT_SHIPPED'
    | 'NO_VALID_APPROVAL'
    | 'CUSTOMER_NOT_ACTIVE'
    | 'BOX_NOT_APPROVED'
    | 'INSUFFICIENT_DATA';
  say: string;
  facts_used: string[];
  forbidden_claims: string[];
  safety_flags: string[];
}

function parseJsonish<T>(value: unknown): T | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

export function coerceDeliveryStatusReasonerInput(
  input: Record<string, unknown>
): DeliveryStatusReasonerInput {
  const parsedArray = parseJsonish<string[]>(input.letzte_box);
  const lastBoxValue =
    Array.isArray(input.letzte_box)
      ? (input.letzte_box as string[])
      : parsedArray
        ? parsedArray
        : asString(input.letzte_box);

  return {
    status: asString(input.status),
    box_genehmigt: asString(input.box_genehmigt),
    letzte_box: lastBoxValue,
    gen_pg54_ab: asString(input.gen_pg54_ab),
    gen_pg51_ab: asString(input.gen_pg51_ab),
    requested_month: asString(input.requested_month),
    now: asString(input.now),
    vip: asBoolean(input.vip),
  };
}

export function runDeliveryStatusReasoner(
  input: DeliveryStatusReasonerInput
): DeliveryStatusReasonerResult {
  const forbidden_claims = [
    'tracking',
    'recent approval',
    'currently being prepared for past month',
  ];
  const facts_used: string[] = [];

  if (!input.status || !input.box_genehmigt || !input.requested_month) {
    return {
      ok: false,
      delivery_status: 'INSUFFICIENT_DATA',
      say: 'Für eine verlässliche Aussage fehlen mir noch Daten zum Lieferstatus.',
      facts_used,
      forbidden_claims,
      safety_flags: ['insufficient_delivery_data'],
    };
  }

  const normalizedStatus = normalize(input.status);
  const normalizedApproval = normalize(input.box_genehmigt);
  const normalizedRequestedMonth = normalize(input.requested_month);

  facts_used.push(`status=${normalizedStatus}`);
  facts_used.push(`box_genehmigt=${normalizedApproval}`);

  if (normalizedStatus !== 'aktiv') {
    return {
      ok: true,
      delivery_status: 'CUSTOMER_NOT_ACTIVE',
      say: 'In den vorliegenden Daten sehe ich keine aktive Pflegebox-Versorgung.',
      facts_used,
      forbidden_claims,
      safety_flags: ['customer_not_active'],
    };
  }

  if (normalizedApproval !== 'genehmigt') {
    return {
      ok: true,
      delivery_status: 'BOX_NOT_APPROVED',
      say: 'In den vorliegenden Daten ist die Pflegebox nicht als genehmigt hinterlegt.',
      facts_used,
      forbidden_claims,
      safety_flags: ['box_not_approved'],
    };
  }

  if (!input.gen_pg54_ab && !input.gen_pg51_ab) {
    return {
      ok: true,
      delivery_status: 'NO_VALID_APPROVAL',
      say: 'In den vorliegenden Daten fehlt eine nutzbare Genehmigungsgrundlage für die Pflegebox.',
      facts_used: [...facts_used, 'missing approval start dates'],
      forbidden_claims,
      safety_flags: ['missing_approval_dates'],
    };
  }

  const shipments = Array.isArray(input.letzte_box)
    ? input.letzte_box
    : input.letzte_box
      ? [input.letzte_box]
      : [];
  const normalizedShipments = shipments.map((item) => normalize(item));
  const shipped = normalizedShipments.some((item) => item.includes(normalizedRequestedMonth));

  if (shipped) {
    return {
      ok: true,
      delivery_status: 'ACTIVE_AND_SHIPPED',
      say: `Für ${input.requested_month} sehe ich in den vorliegenden Daten eine versendete Pflegebox.`,
      facts_used: [...facts_used, 'letzte_box contains requested month'],
      forbidden_claims,
      safety_flags: [],
    };
  }

  return {
    ok: true,
    delivery_status: 'ACTIVE_NOT_SHIPPED',
    say: `Für ${input.requested_month} sehe ich keine versendete Pflegebox in den vorliegenden Daten.`,
    facts_used: [...facts_used, 'letzte_box does not contain requested month'],
    forbidden_claims,
    safety_flags: [],
  };
}
