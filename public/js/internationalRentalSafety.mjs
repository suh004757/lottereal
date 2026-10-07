const REVIEWED_AT = '2026-10-08';
const SEARCH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'am', 'i', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'this', 'that', 'can', 'could', 'you', 'me', 'my', 'help', 'question',
  'need', 'want', 'home', 'house', 'korea', 'please'
]);

export const INTERNATIONAL_RENTAL_ISSUES = Object.freeze([
  issue({
    id: 'deposit-return',
    title: 'Deposit return or unexpected deductions',
    aliases: ['deposit', 'refund', 'return', 'deduction', 'landlord has not returned', 'move out', 'security deposit'],
    beforeSigning: ['State the deposit-return date, permitted deductions and handover conditions in writing.'],
    evidenceToKeep: ['Signed lease, payment records, move-in and move-out photos, repair messages and the key-handover record.'],
    firstSteps: ['Ask for the amount, reason and payment date in writing; preserve the lease and payment evidence before moving out.'],
    whenToEscalate: 'Before surrendering possession or changing an address report when a substantial deposit remains unpaid, obtain case-specific professional guidance.',
    sources: [
      source('Housing Lease Protection Act, Article 3-2', 'https://www.law.go.kr/법령/주택임대차보호법/제3조의2'),
      source('Housing Lease Protection Act, Article 11', 'https://www.law.go.kr/법령/주택임대차보호법/제11조')
    ]
  }),
  issue({
    id: 'owner-verification',
    title: 'Landlord, agent and property-record verification',
    aliases: ['landlord', 'owner', 'agent', 'authority', 'registry', 'property record', 'proxy', 'power of attorney'],
    beforeSigning: ['Verify the landlord’s identity, ownership or authority to lease and review the current property registry before paying a deposit.'],
    evidenceToKeep: ['Registry copy, identity or authority check record, signed lease and payment-account confirmation.'],
    firstSteps: ['Pause payment if names, authority or account details do not match; resolve the discrepancy through the broker and official record.'],
    whenToEscalate: 'Do not transfer a deposit while ownership, agency authority or the recipient account remains unclear.',
    sources: [source('Supreme Court Internet Registry Office', 'https://www.iros.go.kr/')]
  }),
  issue({
    id: 'fees-utilities',
    title: 'Maintenance fees and utilities',
    aliases: ['maintenance', 'management fee', 'utility', 'utilities', 'electricity', 'gas', 'water', 'internet', 'fee'],
    beforeSigning: ['List the management fee, what it covers, separately metered utilities and any cleaning or move-out charges.'],
    evidenceToKeep: ['Written fee breakdown, meter readings, bills and the move-in condition record.'],
    firstSteps: ['Request an itemized explanation before paying a charge that was not stated in the lease or disclosure.'],
    whenToEscalate: 'Seek review when a material recurring fee or deduction has no contractual basis or supporting record.',
    sources: [source('Korea Legal Information Center', 'https://www.law.go.kr/')]
  }),
  issue({
    id: 'mold-repairs',
    title: 'Mold, condensation, leaks and repairs',
    aliases: ['mold', 'mould', 'condensation', 'leak', 'water', 'repair', 'boiler', 'heating', 'damage', 'humidity'],
    beforeSigning: ['Photograph walls, ceilings, windows, plumbing and heating; write any existing defect and repair promise into the lease or inventory.'],
    evidenceToKeep: ['Dated photos and video, humidity or leak records, repair requests, replies, estimates and invoices.'],
    firstSteps: ['Notify the landlord or broker promptly in writing, limit further damage where safe and avoid destroying evidence before inspection.'],
    whenToEscalate: 'Urgent safety, major water damage or an unresolved habitability problem needs professional or official assistance.',
    sources: [source('Civil Act, Article 623', 'https://www.law.go.kr/법령/민법/제623조')]
  }),
  issue({
    id: 'early-termination',
    title: 'Short-term leases and early termination',
    aliases: ['early termination', 'terminate', 'move out early', 'short term', 'six month', '6 month', 'notice', 'replacement tenant'],
    beforeSigning: ['State the exact move-out date, notice period, whether early termination is allowed and how the deposit is returned.', 'A six-month term alone does not decide statutory protection, but a lease clearly intended only for temporary use may be treated differently.'],
    evidenceToKeep: ['Lease, special clauses, notice messages and any written agreement about a replacement tenant or fees.'],
    firstSteps: ['Check the signed termination clause before giving notice; obtain any revised move-out and payment agreement in writing.'],
    whenToEscalate: 'Get case-specific review before relying on an oral promise or leaving while deposit and remaining-rent terms are disputed.',
    sources: [
      source('Civil Act', 'https://www.law.go.kr/법령/민법'),
      source('Housing Lease Protection Act, Article 11', 'https://www.law.go.kr/법령/주택임대차보호법/제11조')
    ]
  }),
  issue({
    id: 'furniture-condition',
    title: 'Furniture, appliances and move-out condition',
    aliases: ['furniture', 'appliance', 'inventory', 'damage', 'cleaning', 'condition', 'stain', 'broken'],
    beforeSigning: ['Attach an inventory stating each included item, existing damage, repair responsibility and any cleaning condition.'],
    evidenceToKeep: ['Dated room-by-room photos, appliance test video, inventory and repair messages.'],
    firstSteps: ['Report existing or newly discovered damage promptly and agree in writing before replacing or discarding an item.'],
    whenToEscalate: 'Disputed high-value damage or deposit deductions should be reviewed against the inventory and evidence.',
    sources: [source('Civil Act, Article 623', 'https://www.law.go.kr/법령/민법/제623조')]
  }),
  issue({
    id: 'pets',
    title: 'Pets and restoration obligations',
    aliases: ['pet', 'pets', 'cat', 'dog', 'animal', 'restoration', 'cleaning', 'pet damage'],
    beforeSigning: ['Obtain written permission for the specific pet and record cleaning, damage and restoration conditions.'],
    evidenceToKeep: ['Pet clause, move-in photos, cleaning receipts and messages about any damage.'],
    firstSteps: ['Do not rely only on an advertisement or oral permission; resolve pet conditions before paying a deposit.'],
    whenToEscalate: 'Seek review if the written lease conflicts with prior representations or a large deduction is demanded.',
    sources: [source('Korea Legal Information Center', 'https://www.law.go.kr/')]
  }),
  issue({
    id: 'contract-language',
    title: 'Korean contracts and translation differences',
    aliases: ['korean contract', 'translation', 'translated contract', 'english contract', 'language', 'special clause', 'meaning'],
    beforeSigning: ['Compare the Korean original and any translation line by line, identify which text controls and write agreed material terms into the signed contract.'],
    evidenceToKeep: ['Every signed language version, special clauses, translation notes and messages resolving wording differences.'],
    firstSteps: ['Do not sign or transfer money while a material term—such as deposit return, early termination, fees, repairs or furniture—has different wording.'],
    whenToEscalate: 'Ask for professional translation or legal review when an unresolved wording difference changes a payment, deadline, right or obligation.',
    sources: [source('Korea Legal Information Center', 'https://www.law.go.kr/')]
  }),
  issue({
    id: 'address-reporting',
    title: 'Address reporting, rental reporting and fixed date',
    aliases: ['address', 'report address', 'residence', 'place of stay', 'foreigner registration', 'fixed date', 'hwakjeong', 'rental reporting', 'move-in report'],
    beforeSigning: ['Confirm which address, rental-contract reporting and fixed-date procedures apply to the property and your immigration status.'],
    evidenceToKeep: ['Signed lease, possession date, reporting receipts and fixed-date record where applicable.'],
    firstSteps: ['A registered foreign resident who changes the place of stay generally reports within 15 days; first registration and overseas-Korean procedures may differ.'],
    whenToEscalate: 'Confirm the current process with immigration or the local community service center before relying on a protection deadline.',
    sources: [
      source('Immigration Act, Article 36', 'https://www.law.go.kr/법령/출입국관리법/제36조'),
      source('Immigration Act, Article 88-2', 'https://www.law.go.kr/법령/출입국관리법/제88조의2'),
      source('Housing Lease Protection Act, Article 3-2', 'https://www.law.go.kr/법령/주택임대차보호법/제3조의2')
    ]
  }),
  issue({
    id: 'payment-safety',
    title: 'Payment requests and impersonation',
    aliases: ['payment', 'transfer', 'bank', 'account', 'impersonation', 'scam', 'passport', 'identity', 'remote'],
    beforeSigning: ['Confirm the property, contracting party, payment recipient and purpose before transferring money.'],
    evidenceToKeep: ['Verified contact channel, account-confirmation record, signed agreement and transfer receipt.'],
    firstSteps: ['Pause when account details change unexpectedly or someone pressures you to pay before verification.'],
    whenToEscalate: 'Contact the broker or institution through an independently verified channel before sending money or identity documents.',
    sources: [source('Supreme Court Internet Registry Office', 'https://www.iros.go.kr/')]
  }),
  issue({
    id: 'brokerage-fee',
    title: 'Brokerage fee and statutory cap',
    aliases: ['brokerage', 'broker fee', 'commission', 'agent fee', 'statutory cap', 'realtor'],
    beforeSigning: ['Ask for the estimated brokerage fee and applicable statutory cap before signing.'],
    evidenceToKeep: ['Fee explanation, transaction amount, signed contract and receipt.'],
    firstSteps: ['Request an itemized calculation if the amount differs from the estimate.'],
    whenToEscalate: 'Check the applicable local cap and transaction type before paying a disputed fee.',
    sources: [source('Licensed Real Estate Agents Act, Article 32', 'https://www.law.go.kr/법령/공인중개사법/제32조')]
  })
]);

const SUGGESTIONS = Object.freeze([
  'My deposit has not been returned',
  'There is mold or a leak in the home',
  'I want to end a short-term lease early',
  'How do address reporting and a fixed date work?'
]);

export function getInternationalRentalSuggestions() {
  return [...SUGGESTIONS];
}

export function searchInternationalRentalSafety(rawQuery, { limit = 3 } = {}) {
  const query = normalize(rawQuery);
  if (query.length < 2) return { matches: [], detectedTopicIds: [] };

  const tokens = query.split(' ').filter((token) => token.length >= 3 && !SEARCH_STOP_WORDS.has(token));
  const scored = INTERNATIONAL_RENTAL_ISSUES.map((entry) => {
    const aliases = entry.aliases.map(normalize);
    const haystack = normalize([entry.title, ...entry.aliases, ...entry.beforeSigning, ...entry.firstSteps].join(' '));
    let score = 0;
    for (const alias of aliases) {
      if (query.includes(alias)) score += alias.includes(' ') ? 18 : 10;
    }
    for (const token of tokens) {
      if (haystack.includes(token)) score += 2;
    }
    return { entry, score };
  }).filter(({ score }) => score >= 4)
    .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title));

  const safeLimit = Math.min(Math.max(Number(limit) || 3, 1), 3);
  return {
    matches: scored.slice(0, safeLimit).map(({ entry }) => entry),
    detectedTopicIds: scored.filter(({ score }) => score >= 10).slice(0, 6).map(({ entry }) => entry.id)
  };
}

function issue(value) {
  return Object.freeze({ ...value, lastReviewed: REVIEWED_AT });
}

function source(name, url) {
  return Object.freeze({ name, url });
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^0-9a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
