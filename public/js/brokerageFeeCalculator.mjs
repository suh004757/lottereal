const HOUSING_SALE_BANDS = [
  { below: 50_000_000, rate: 0.006, cap: 250_000 },
  { below: 200_000_000, rate: 0.005, cap: 800_000 },
  { below: 900_000_000, rate: 0.004, cap: null },
  { below: 1_200_000_000, rate: 0.005, cap: null },
  { below: 1_500_000_000, rate: 0.006, cap: null },
  { below: Infinity, rate: 0.007, cap: null },
];

const HOUSING_RENT_BANDS = [
  { below: 50_000_000, rate: 0.005, cap: 200_000 },
  { below: 100_000_000, rate: 0.004, cap: 300_000 },
  { below: 600_000_000, rate: 0.003, cap: null },
  { below: 1_200_000_000, rate: 0.004, cap: null },
  { below: 1_500_000_000, rate: 0.005, cap: null },
  { below: Infinity, rate: 0.006, cap: null },
];

function selectBand(bands, amount) {
  return bands.find((band) => amount < band.below);
}

function feeResult(transactionAmount, band, extra = {}) {
  const rawFee = Math.floor(transactionAmount * band.rate);
  const ceilingFee = band.cap === null ? rawFee : Math.min(rawFee, band.cap);
  const vatAtTenPercent = Math.floor(ceilingFee * 0.1);
  return {
    transactionAmount,
    rate: band.rate,
    cap: band.cap,
    ceilingFee,
    vatAtTenPercent,
    totalWithVatAtTenPercent: ceilingFee + vatAtTenPercent,
    ...extra,
  };
}

function rentalAmount(deposit, monthlyRent) {
  if (monthlyRent === 0) return { transactionAmount: deposit, monthlyMultiplier: null };
  const amountAt100 = deposit + (monthlyRent * 100);
  const monthlyMultiplier = amountAt100 < 50_000_000 ? 70 : 100;
  return {
    transactionAmount: deposit + (monthlyRent * monthlyMultiplier),
    monthlyMultiplier,
  };
}

const MAX_TRANSACTION_AMOUNT = 100_000_000_000_000;

function requireAmount(value, { allowZero = false } = {}) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_TRANSACTION_AMOUNT || (!allowZero && value === 0)) {
    throw new RangeError('금액은 허용 범위 안의 숫자여야 합니다.');
  }
}

export function calculateBrokerageFee({ propertyType, transactionType, price, deposit = 0, monthlyRent = 0 }) {
  const supportedPropertyTypes = ['housing', 'officetel-standard', 'officetel-other', 'other'];
  if (!supportedPropertyTypes.includes(propertyType) || !['sale', 'rent'].includes(transactionType)) {
    throw new RangeError('지원하지 않는 계산 조건입니다.');
  }

  let transactionAmount;
  let monthlyMultiplier = null;
  if (transactionType === 'sale') {
    requireAmount(price);
    transactionAmount = price;
  } else {
    requireAmount(deposit, { allowZero: true });
    requireAmount(monthlyRent, { allowZero: true });
    const rental = rentalAmount(deposit, monthlyRent);
    requireAmount(rental.transactionAmount);
    transactionAmount = rental.transactionAmount;
    monthlyMultiplier = rental.monthlyMultiplier;
  }

  if (propertyType === 'housing' && transactionType === 'sale') {
    return feeResult(transactionAmount, selectBand(HOUSING_SALE_BANDS, transactionAmount), {
      monthlyMultiplier: null,
    });
  }
  if (propertyType === 'housing' && transactionType === 'rent') {
    return feeResult(transactionAmount, selectBand(HOUSING_RENT_BANDS, transactionAmount), {
      monthlyMultiplier,
    });
  }

  const rate = propertyType === 'officetel-standard'
    ? (transactionType === 'sale' ? 0.005 : 0.004)
    : 0.009;
  return feeResult(transactionAmount, { rate, cap: null }, { monthlyMultiplier });
}
